---
type: feature
id: WI-005
title: "Ingest pipeline: S3 event → parsers → Bedrock Titan embeddings → pgvector"
knowledge_level: K2
status: draft
phase: now
branch: feature/post-wi-003-rag-infra
initiative: "RM-001"
created_at: "2026-08-28"
source: post-wi-003-decisions
source_id: post-wi-003-decisions-2026-08-28
source_title: "Ingest pipeline for chatSaaS RAG"
source_context: "Derived from the post-WI-003 decision set (Q1 Aurora+pgvector committed in ADR-004, Q3 ordered as Infra/CDK → Bedrock+RAG → Frontend). WI-004 produces the `public.embeddings` table, the HNSW index, the RDS Proxy, and the embedding column type (`vector(1024)`). Without this WI, no document can be turned into embeddings and the table stays empty; the retrieval query in WI-006 has nothing to return."
source_initiative: "Public Document-Grounded Chatbot"
expected_value: "An end-to-end ingest pipeline: a company uploads a PDF/DOCX/TXT/MD via the existing admin API; the file lands in S3; an EventBridge rule fires on `Object Created: Put`; a new `IngestLambda` downloads the file, picks the right parser (`pdf-parse` for PDF, `mammoth` for DOCX, raw read for TXT/MD), splits the text into chunks sized for Titan v2 (≈ 800–1200 chars with 15–20% overlap), calls `amazon.titan-embed-text-v2:0` per chunk via Bedrock, and writes `(id, chatbot_id, company_id, content, embedding)` rows into `public.embeddings` through RDS Proxy. Idempotent on `(chatbot_id, content_sha256)`. Parse failures route to a DLQ + S3 marker; Bedrock throttling retries with bounded exponential backoff; DB write failures retry the chunk insert. Structured JSON logs include `chatbot_id`, `company_id`, `document_id`, `chunk_index`, `latency_ms`, `embedding_model_id`, and `error_class`. The pipeline is unit-tested with a stubbed Bedrock client and end-to-end smoke-tested against a dev Aurora cluster."
risks:
  - "**SECURITY (CRITICAL)**: `company_id` and `chatbot_id` are tenant scope. They MUST be derived from the verified Cognito JWT (`sub` → server-controlled company mapping) plus the `:chatbotId` URL path, NEVER from the request body, query string, or any client-controlled field. The Document row that triggers ingest is itself looked up by `id` and the resolver asserts the row's `chatbot_id` matches the path param and that the JWT principal owns the parent chatbot. A misbehaving handler that trusts a body field would let a tenant write embeddings under another tenant's `chatbot_id`. (See `auth/claims.ts` SECURITY NOTE: `custom:company_id` is display-only.)"
  - "Aurora Serverless v2 + pgvector is the chosen store (ADR-004). The Lambda MUST go through RDS Proxy — opening raw connections per invocation is a known anti-pattern and will exhaust the cluster under any concurrent upload."
  - "Bedrock throttling on `amazon.titan-embed-text-v2:0` is real. Single-burst `InvokeModel` calls can hit `ThrottlingException` at the 25–50 req/s account default. The handler must retry with exponential backoff (jittered, bounded to 5–6 attempts) and degrade gracefully."
  - "Chunk size affects both recall and per-document cost. Too small → many embeddings → cost and noise; too large → embeddings blur across topics. 1024-dim Titan v2 has a 8192-token input cap; 800–1200 chars with 15–20% overlap is a defensible default but is a tunable knob and is listed as an open question."
  - "Idempotency strategy choice: a unique index on `(chatbot_id, content_sha256)` plus `INSERT ... ON CONFLICT DO NOTHING` is the simplest correct option. Pre-check + insert is racy; pure dedupe in code is non-atomic. The unique index makes the DB the source of truth for 'have I already embedded this chunk' and is recommended, but it is a schema change that lands on the embeddings table — the table is created in WI-004, so this WI must add the index via a follow-up custom resource or a migration (open question)."
  - "S3 bucket placement is unresolved: WI-004 does not provision the documents bucket. This WI either adds the bucket to the WI-004 stack as a follow-up OR a separate `WI-004b` provisions it. The proposal names this as a blocker dependency."
  - "PDFs that are scanned images produce empty text. ADR-004 accepts this for MVP (in-Lambda parsers, no OCR). The pipeline must NOT fail the whole document on a single empty page; it logs a warning and continues. A future Textract fallback is a single-file change in the parser module."
  - "Idempotency at the document level (re-uploading the same file) must also avoid double-billing the customer. `document_processing_volume` is metered in `UsageMetric` per `knowledge/tech/decisions/005-cost-attribution-and-billing-mechanism.md`; metering the second ingest is a billing bug. Mitigation: idempotency at the chunk level (above) plus a `documents.status` state machine (`uploaded` → `processing` → `ready` / `failed`) so a re-upload of a `ready` document is a no-op (or creates a new document row only when the user clicks 'replace')."
dependencies:
  - "WI-002 (completed) — establishes the handler factory pattern. This WI adds a `POST /api/chatbots/:chatbotId/documents` factory to the existing server bootstrap."
  - "WI-003 (completed) — establishes the Cognito JWT verifier onRequest hook. The new admin route uses the same `preHook`; the JWT-claimed `sub` is the principal that resolves to `company_id`."
  - "WI-004 (ready) — provisions the Aurora Serverless v2 + pgvector + RDS Proxy + Secrets Manager + `public.embeddings` table. This WI writes into that table and must go through the proxy."
  - "ADR-001 (Use Amazon Cognito for User Authentication) — JWT verification contract."
  - "ADR-003 (Technology Stack Selection) — Fastify 5.x, Node 24 Lambda, pnpm workspaces."
  - "ADR-004 (AWS Service Selection for AI Capabilities, 2026-08-28 revision) — Bedrock + Aurora+pgvector + in-Lambda parsers + RDS Proxy. The entire design of this WI is downstream of this ADR."
  - "ADR-005 (Cost Attribution and Billing Mechanism) — `document_processing_volume` metering lives on `UsageMetric`; this WI increments the meter on successful ingest (read-only here, the metering job is a follow-up)."
  - "ADR-006 (Data Partitioning Strategy for Tenant Isolation) — every `embeddings` row MUST carry `chatbot_id` and `company_id`; the retrieval query filters on both. This WI is the first writer into that table and must enforce the contract from day 1."
  - "`@aws-sdk/client-bedrock-runtime@^3`, `@aws-sdk/client-s3@^3`, `@aws-sdk/client-rds-data@^3` (or `@aws-sdk/client-secrets-manager` for proxy auth token) must be added to `apps/functions/package.json` and `infra/.../ingest-lambda` package."
  - "`pdf-parse@^1`, `mammoth@^1`, `langchain@^1` (for `RecursiveCharacterTextSplitter`), `@langchain/aws@^1` must be added to the new `ingest-lambda` package."
  - "A server-controlled `sub → company_id` mapping is required before the JWT principal can be trusted to author `company_id`. RESOLVED (DC-005-1, 2026-08-28): the mapping's chain of custody lives in WI-008 — its post-confirmation Lambda is the only writer of `custom:company_id` (immutable attribute), its SignUp rejects client-supplied `custom:company_id`, and its pre-token-generation Lambda copies the claim server-side. Under those invariants the JWT claim is trustworthy for tenant authorization and `resolveTenant` reads it directly. The `auth/claims.ts` SECURITY NOTE is updated during implementation to describe the custody chain. Future multi-org growth migrates `resolveTenant` to a DynamoDB `users` table (documented migration path; single-module change)."
code:
  - "apps/functions/src/api/documentsUpload.ts"
  - "apps/functions/src/api/documentsList.ts"
  - "apps/functions/src/api/documentGet.ts"
  - "apps/functions/src/api/__tests__/documentsUpload.test.ts"
  - "apps/functions/src/api/__tests__/documentsList.test.ts"
  - "apps/functions/src/api/__tests__/documentGet.test.ts"
  - "apps/functions/src/ingest/types.ts"
  - "apps/functions/src/ingest/parsePdf.ts"
  - "apps/functions/src/ingest/parseDocx.ts"
  - "apps/functions/src/ingest/parseText.ts"
  - "apps/functions/src/ingest/splitter.ts"
  - "apps/functions/src/ingest/embedBedrock.ts"
  - "apps/functions/src/ingest/persistEmbeddings.ts"
  - "apps/functions/src/ingest/resolveTenant.ts"
  - "apps/functions/src/ingest/logger.ts"
  - "apps/functions/src/ingest/__tests__/parsePdf.test.ts"
  - "apps/functions/src/ingest/__tests__/parseDocx.test.ts"
  - "apps/functions/src/ingest/__tests__/parseText.test.ts"
  - "apps/functions/src/ingest/__tests__/splitter.test.ts"
  - "apps/functions/src/ingest/__tests__/embedBedrock.test.ts"
  - "apps/functions/src/ingest/__tests__/persistEmbeddings.test.ts"
  - "apps/functions/src/ingest/__tests__/resolveTenant.test.ts"
  - "apps/functions/src/server.ts (modified — register the new admin routes under `/api/chatbots`)"
  - "apps/functions/.env.example (modified — new ingest env vars: `DOCUMENTS_BUCKET`, `INGEST_LAMBDA_ARN`, `BEDROCK_EMBED_MODEL_ID`, `CHUNK_SIZE`, `CHUNK_OVERLAP`, `RDS_PROXY_ENDPOINT`, `RDS_PROXY_SECRET_ARN`, `AWS_REGION`)"
  - "infra/lib/ingest-bucket.ts (new — S3 bucket for uploaded documents, server-side-encrypted, versioning, lifecycle, event-notification-config to EventBridge)"
  - "infra/lib/ingest-lambda.ts (new — `IngestLambda` construct: Node 24, env vars from Secrets Manager/SSM, S3 read + Bedrock invoke + RDS Proxy IAM, DLQ via SQS, log group with 30-day retention)"
  - "infra/lib/ingest-eventbridge-rule.ts (new — pattern `s3:ObjectCreated:Put` on the documents bucket prefix, target = IngestLambda)"
  - "infra/lib/ingest-embeddings-index.ts (new — follow-up custom resource or migration that adds the `(chatbot_id, content_sha256)` unique index on `public.embeddings`; idempotent, `IF NOT EXISTS`)"
  - "infra/lib/chat-saas-stack.ts (modified — wire the four new constructs into the stack)"
  - "infra/test/ingest-bucket.test.ts"
  - "infra/test/ingest-lambda.test.ts"
  - "infra/test/ingest-eventbridge-rule.test.ts"
  - "infra/test/chat-saas-stack.test.ts (modified — assertions for the new resources)"
  - "knowledge/tech/decisions/004-aws-service-selection-for-ai-capabilities.md (no change — design is downstream)"
  - "knowledge/delivery/work-items/draft/WI-005-ingest-pipeline.md (this file, once promoted)"
  - "tasks/WI-005-ingest-pipeline-tasks.yml (new — task list, format mirrored on tasks/WI-004-cdk-app-bootstrap-tasks.yml)"
---

# WI-005: Ingest pipeline — S3 event → parsers → Bedrock Titan embeddings → pgvector

## Goal

Wire the missing half of the chatSaaS RAG loop: turn a customer-uploaded document into rows in the `public.embeddings` table that WI-004 just provisioned. The pipeline is the first writer into the embeddings store and the only place in the system that calls `InvokeModel` for embeddings. It is the dependency that unblocks both the retrieval handler (WI-006) and the Operator's Board upload UX (WI-008).

The flow is event-driven, not request-driven. The customer's HTTP POST only persists the file and registers a `Document` row in status `uploaded`; everything from that point on runs asynchronously inside an `IngestLambda` triggered by EventBridge on `s3:ObjectCreated:Put`. Splitting the request handler from the work is deliberate: PDF parsing + hundreds of embedding calls easily exceed API Gateway's 29 s limit, and a partial failure (Bedrock throttling, DB write retry) must not roll back the upload from the customer's point of view.

Tenant isolation is the load-bearing constraint. `company_id` and `chatbot_id` are read once from the verified Cognito JWT plus a server-controlled lookup (the JWT's `custom:company_id` claim is **not** trusted, per the SECURITY NOTE in `apps/functions/src/auth/claims.ts`) and are bound to every embedding row for the lifetime of the document. The same values ride in the S3 object key prefix and in the EventBridge event payload; the ingest Lambda re-validates them before it ever calls Bedrock or Aurora.

Idempotency is enforced at the chunk level by a unique index on `(chatbot_id, content_sha256)` plus `INSERT ... ON CONFLICT DO NOTHING`. Re-uploading the same file, replaying an EventBridge event, or a partial failure that retried only some chunks all converge on the same final state without double-charging the customer's `document_processing_volume` meter.

## Scope

**In scope:**

- New admin endpoints (handler factories, mounted in `server.ts`):
  - `POST /api/chatbots/:chatbotId/documents` — multipart upload, max 10 MB, allowed types `.pdf`, `.docx`, `.txt`, `.md`. Persists the file to the documents S3 bucket under `s3://<bucket>/<company_id>/<chatbot_id>/<document_id>/<filename>`, inserts a `Document` row in `uploaded` status, and returns 201.
  - `GET /api/chatbots/:chatbotId/documents` — lists `Document` rows for the chatbot (status enum: `uploaded` / `processing` / `ready` / `failed`).
  - `GET /api/documents/:documentId` — single-document status, used by the operator's board polling for ingest completion.
- A new `IngestLambda` (Node 24, `aws-cdk-lib/aws-lambda-nodejs`) that:
  - Receives the S3 event (bucket + key), re-resolves the tenant from the key prefix against the JWT-derived owner (the key prefix is treated as untrusted; the document row in DynamoDB/Aurora is the source of truth for ownership), looks up the `Document` row, downloads the file, picks the parser, splits, embeds, persists.
  - Updates the `Document.status` state machine: `uploaded` → `processing` → `ready` (or `failed` on terminal errors) and writes a `metadata.ingest` JSON blob with chunk count, model id, latency, sha256 set.
- An S3 event notification → EventBridge → Lambda rule (`s3:ObjectCreated:Put` on the documents bucket).
- A DLQ via SQS for terminal failures (parse error after all retries, persistent Bedrock `AccessDeniedException`, etc.), with a parallel `s3://<bucket>/_failed/<document_id>/error.json` marker file written for human inspection.
- Structured JSON logs (`@aws-lambda-powertools/logger` or hand-rolled) with fields: `request_id`, `document_id`, `chatbot_id`, `company_id`, `chunk_index`, `embedding_model_id`, `latency_ms`, `error_class`.
- Bounded exponential backoff with jitter for Bedrock `ThrottlingException` (max 5 attempts, base 200 ms, cap 5 s).
- CDK constructs for the bucket, the Lambda, the EventBridge rule, and the unique index on `public.embeddings`.
- Unit tests for parsers, splitter, embedder (with stubbed Bedrock), persister (with a Postgres test container or in-memory mock of the pg driver), and the tenant resolver. Integration test that uploads a 4-page PDF against a LocalStack S3 + a stub Bedrock and asserts rows land in `public.embeddings`.
- Documentation in `apps/functions/README.md` of the S3 → EventBridge → Lambda contract and the tenant-isolation guarantee.

**Out of scope (and noted as follow-up WIs):**

- Retrieval + chat handler (WI-006).
- The Operator's Board UI (WI-007 / WI-008).
- Scanned-PDF OCR fallback (Textract). ADR-004 defers this. The parser module is structured so a Textract branch is a single-file change.
- A `Document` table in Aurora. WI-004 only provisions `public.embeddings`. The `Document` row in this proposal lives in DynamoDB on the existing `chat-saas` table (the env-var placeholder `DOCUMENTS_TABLE_NAME` is already declared in `apps/functions/.env.example`). A follow-up WI can move it to Aurora when the rest of the entity tables migrate.
- Cost-metering writes. This WI only increments the `Document.metadata.ingest.byte_count` field; the nightly metering job is a separate WI.
- Sub → company mapping. The CRITICAL security constraint above is real, and the resolution is listed as an open question. If the mapping is not in place when this WI lands, the upload route returns 501 Not Implemented and the proposal is unblocked only by a `WI-005-pre` or by including the mapping inside this WI.
- Production stack, multi-region, cross-region replication, customer-managed KMS keys.
- Rate limiting on `POST /api/chatbots/:chatbotId/documents` (separate WI per the rate-limit note in `api-spec.md`).

## Acceptance Criteria

1. `pnpm -F infra synth` produces a CloudFormation template that adds: the documents S3 bucket (with `BucketEncryption: SSE-S3` and `VersioningConfiguration: Enabled`), the `IngestLambda` (Node 24 runtime, handler `index.handler`, 1024 MB memory, 5-min timeout, DLQ configured), the EventBridge rule on `s3:ObjectCreated:Put` with the bucket as the source, and a follow-up custom resource SQL containing `CREATE UNIQUE INDEX IF NOT EXISTS embeddings_chatbot_content_sha256 ON public.embeddings (chatbot_id, content_sha256)`.
2. `pnpm -F infra test` runs all CDK assertions green, including new assertions for the four new constructs.
3. `pnpm -F functions type-check` exits 0 after the new admin routes are added.
4. `pnpm -F functions test` runs vitest with at minimum: 19 legacy + 5 documentsUpload + 3 documentsList + 3 documentGet + 4 parsePdf + 3 parseDocx + 2 parseText + 3 splitter + 4 embedBedrock (with stubbed Bedrock + throttling scenario) + 4 persistEmbeddings + 3 resolveTenant tests, all green.
5. A PDF (4 pages, ~3 000 chars) uploaded through the admin endpoint produces one `Document` row in status `ready` and exactly N rows in `public.embeddings` where N equals the splitter's chunk count, with `company_id` and `chatbot_id` matching the JWT principal and path param, and `embedding` being a non-null `vector(1024)` whose L2 norm is ≈ 1.0 (Titan v2 normalizes).
6. A second upload of the same file (same bytes, same `chatbot_id`) produces zero new `embeddings` rows and does not double-bill the `document_processing_volume` counter (verified by the `Document.metadata.ingest.byte_count` staying constant on a re-upload of a `ready` document).
7. A `ThrottlingException` from Bedrock is retried with exponential backoff (5 attempts, base 200 ms, cap 5 s) and the test asserts the retry counter is non-zero; a `ValidationException` is NOT retried and lands on the DLQ + marker file.
8. A malformed PDF (corrupt header) is logged with `error_class: 'ParseError'`, the `Document.status` moves to `failed`, an entry is pushed to the DLQ, and a marker file is written to `s3://<bucket>/_failed/<document_id>/error.json`.
9. The handler's source code contains a comment block (or lint rule) stating that `company_id` and `chatbot_id` MUST be derived from the verified JWT and a server-controlled lookup, never from the request body, query string, or any other client-controlled field; the unit test for `resolveTenant` asserts that a request with a body field `company_id = 'spoofed'` does NOT influence the returned tenant.
10. `kaddo guard` exits 0 after implementation. `kaddo questions` does not surface a new blocking question that this WI should have resolved.
11. `apps/functions/README.md` documents: the S3 → EventBridge → Lambda contract, the chunk size + overlap default, the DLQ + marker-file failure mode, and the tenant-isolation invariant.
12. End-to-end smoke (documented in the README, not in CI): deploy the stack to a dev account, upload a PDF through the API, and observe `Document.status` transition to `ready` and the corresponding rows in `public.embeddings` within 60 s.

## Tasks

The task list mirrors the format planned for `tasks/WI-004-cdk-app-bootstrap-tasks.yml` (each task has `id`, `title`, `phase`, `depends_on`, `estimate`, `owner`, `acceptance`). The full YAML is `tasks/WI-005-ingest-pipeline-tasks.yml`; the ordered summary is:

1. **T-01 — Resolve sub → company_id mapping — DONE via DC-005-1.** Decision taken: WI-008 owns the mapping (post-confirmation Lambda is sole writer of immutable `custom:company_id`). No separate resolver service needed; `resolveTenant` (T-07) consumes the JWT claim. Remaining work: coordinate with WI-008 to land its two new ACs (SignUp rejection + IAM scoping) and update the `auth/claims.ts` SECURITY NOTE during implementation.
2. **T-02 — CDK: documents S3 bucket.** New `infra/lib/ingest-bucket.ts` construct. SSE-S3, versioning, lifecycle to IA after 30 d and Glacier after 180 d, `EventBridgeEnabled: true`, public access block, no bucket policy needed (Lambda IAM is sufficient). Depends on: T-01 (only for the `company_id/` key prefix convention; the bucket itself can be built before the resolver). Estimate: S.
3. **T-03 — CDK: IngestLambda construct.** Node 24, 1024 MB / 300 s, env vars from SSM Parameter Store (RDS Proxy endpoint, secret ARN, model id, bucket name, chunk size, chunk overlap), DLQ via SQS, log group with 30-day retention, IAM with `s3:GetObject` on the documents bucket, `bedrock:InvokeModel` on `arn:aws:bedrock:...:foundation-model/amazon.titan-embed-text-v2:0`, `rds-db:connect` on the proxy. Depends on: T-02. Estimate: M.
4. **T-04 — CDK: EventBridge rule.** Pattern `s3:ObjectCreated:Put` on the bucket, target the Lambda, retry policy 24 h with 60-s backoff (per AWS defaults; documented in the construct), DLQ on the rule. Depends on: T-02, T-03. Estimate: S.
5. **T-05 — CDK: unique index on `(chatbot_id, content_sha256)`.** New `infra/lib/ingest-embeddings-index.ts` custom resource. SQL is `CREATE UNIQUE INDEX IF NOT EXISTS embeddings_chatbot_content_sha256_idx ON public.embeddings (chatbot_id, content_sha256);` followed by `ANALYZE public.embeddings;`. The `sha256` column is added as `BYTEA NOT NULL` (32 bytes) via a follow-up `ALTER TABLE IF EXISTS public.embeddings ADD COLUMN IF NOT EXISTS content_sha256 BYTEA;`. Depends on: WI-004 deployed. Estimate: S.
6. **T-06 — packages: dependencies.** Add to `apps/functions/package.json`: `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-rds-data`, `@aws-sdk/client-sqs`, `pdf-parse`, `mammoth`, `langchain`, `@langchain/aws`. Add to `infra/package.json`: nothing new beyond what WI-004 already has. Depends on: nothing. Estimate: XS.
7. **T-07 — Functions: `resolveTenant` module.** Reads the verified JWT from the request, calls the sub→company resolver (T-01), reads the `:chatbotId` path param, asserts the chatbot belongs to the company (a small `chatbots` lookup in DynamoDB), and returns `{ sub, companyId, chatbotId, documentId? }`. Throws 403 on mismatch. Depends on: T-01. Estimate: S.
8. **T-08 — Functions: parser modules.** Three pure functions: `parsePdf(buffer): string[]` (page-level output, `pdf-parse`), `parseDocx(buffer): string` (raw text via `mammoth.extractRawText`), `parseText(buffer, mime): string` (UTF-8 decode, strip BOM, normalize line endings). Each module is pure and unit-tested with fixtures checked into `apps/functions/src/ingest/__fixtures__/`. Depends on: T-06. Estimate: M.
9. **T-09 — Functions: splitter module.** Wraps `RecursiveCharacterTextSplitter` from `langchain/text_splitter`. Defaults: `chunkSize = 1000` chars, `chunkOverlap = 200` chars, separators `['\n\n', '\n', '. ', ' ', '']`. Each chunk carries `{ content, contentSha256, index }`. Depends on: T-06. Estimate: S.
10. **T-10 — Functions: `embedBedrock` module.** Wraps `@aws-sdk/client-bedrock-runtime` `InvokeModelCommand` for `amazon.titan-embed-text-v2:0`. Accepts a `string[]` of chunk contents, batches up to 25 per `InvokeModel` call, returns `number[][]` of length-1024 vectors. Bounded exponential backoff with jitter on `ThrottlingException`; no retry on `ValidationException` / `AccessDeniedException`. Depends on: T-06. Estimate: M.
11. **T-11 — Functions: `persistEmbeddings` module.** Connects to Aurora via the RDS Proxy (RDS Data API OR a `pg` connection through the proxy — picked in T-12). For each chunk, runs:
    ```sql
    INSERT INTO public.embeddings (id, chatbot_id, company_id, content, content_sha256, embedding)
    VALUES ($1, $2, $3, $4, $5, $6::vector)
    ON CONFLICT (chatbot_id, content_sha256) DO NOTHING;
    ```
    Returns the count of newly-inserted rows. Depends on: T-05, T-09, T-10. Estimate: M.
12. **T-12 — Functions: pick the connection path.** Decide RDS Data API vs. raw `pg` through RDS Proxy. Recommendation in the open-questions list; pick the simpler one and document the trade-off in `apps/functions/README.md`. Depends on: nothing (decision), gates T-11 implementation. Estimate: XS.
13. **T-13 — Functions: IngestLambda handler.** Glues T-08 → T-09 → T-10 → T-11, manages the `Document.status` state machine, writes logs in the structured-JSON shape from the spec, publishes to the DLQ + writes the marker file on terminal failure, returns the metadata. Depends on: T-07, T-08, T-09, T-10, T-11, T-12. Estimate: M.
14. **T-14 — Functions: `documentsUpload` admin route.** Multipart handler, writes the file to S3 under `<company_id>/<chatbot_id>/<document_id>/<filename>`, inserts the `Document` row, returns 201. Depends on: T-01, T-02, T-07. Estimate: M.
15. **T-15 — Functions: `documentsList` + `documentGet` admin routes.** Read-only, scoped to the JWT principal's company, ordered by `created_at desc`. Depends on: T-07. Estimate: S.
16. **T-16 — Functions: register routes in `server.ts`.** Mount the three new factories under `/api/chatbots` (upload + list) and `/api/documents` (get), behind the same Cognito JWT preHook used by the existing admin routes. Depends on: T-14, T-15. Estimate: XS.
17. **T-17 — Tests: integration smoke.** Vitest integration test that mounts the S3 client (LocalStack), the EventBridge client (LocalStack), the Bedrock client (stub), and the Aurora client (testcontainers Postgres + `vector` extension). Uploads a fixture PDF and asserts the full state machine. Depends on: T-13, T-14, T-16, infra:localstack running. Estimate: M.
18. **T-18 — Docs: README + runbook.** Document the contract in `apps/functions/README.md` and `infra/README.md` (add to the existing files). Tenant-isolation invariant goes in BOTH the code comment and the README. Depends on: all of the above. Estimate: S.

## Risks and Mitigations

- **R-1 (CRITICAL) — Tenant isolation via JWT body field**: A misbehaving handler that reads `company_id` or `chatbot_id` from the request body or query string would let a tenant write embeddings under another tenant's scope. The Document row's `chatbot_id` and the server-controlled `sub → company_id` mapping are the only trusted sources. The `company_id/` and `chatbot_id/` S3 key prefix is treated as a *hint*, never as authority: the Lambda re-resolves the owner from the Document row before any write. The `resolveTenant` unit test asserts that body/query fields are ignored, and the source comment block is checked in by a code-review checklist. **Mitigation:** lint rule + a `SECURITY.md` note in the repo root pointing to `auth/claims.ts` SECURITY NOTE.
- **R-2 — Bedrock throttling on `amazon.titan-embed-text-v2:0`**: Single-account default is ~25–50 `InvokeModel`/s. A 100-page PDF produces 200–400 chunks and a burst of that many calls will throttle. **Mitigation:** batch up to 25 chunks per `InvokeModel` call (the API supports batched inputs), exponential backoff with jitter, 5 attempts. Document a request-quota increase path in the runbook.
- **R-3 — S3 bucket placement unresolved**: WI-004 does not provision the documents bucket. **Mitigation:** the bucket lives in the WI-005 branch in `infra/lib/ingest-bucket.ts`. If a reviewer wants the bucket in WI-004 instead, the four file additions in `infra/lib/` and the test changes are mirrored in WI-004's branch and the tasks move to `WI-004b`. Either is fine; the choice is a process question, not an architecture one.
- **R-4 — Chunk size / overlap**: too small → noisy retrieval, high cost; too large → blurred topics. **Mitigation:** default to 1 000 / 200 (chars / overlap), expose as env vars, document the trade-off in the README, and surface as a tunable knob for the first pilot customer.
- **R-5 — Idempotency under partial failure**: a mid-document Bedrock failure followed by EventBridge retry must not double-insert chunks that already landed. **Mitigation:** the unique index on `(chatbot_id, content_sha256)` makes `INSERT ... ON CONFLICT DO NOTHING` the single source of truth. The `Document.status` state machine is the secondary guard (`processing` is set before the first embed; only the Lambda that observes `processing` does work).
- **R-6 — RDS Proxy connection storms**: the Lambda MUST go through the proxy; raw connections per invocation exhaust the cluster. **Mitigation:** T-12 picks the connection path explicitly (recommendation: RDS Data API for v1 because it does not need a connection at all; `pg` through the proxy is the alternative if Data API is too slow). Either way, the IAM policy on the Lambda is the only path to the cluster.
- **R-7 — Scanned PDFs return empty text**: parser emits `''` for image pages. **Mitigation:** empty chunks are dropped before the embed call (no Bedrock call, no row). A counter `metadata.ingest.empty_chunks` is written so the customer can be warned in the UI. A future Textract fallback is one parser branch in `parsePdf.ts`.
- **R-8 — DynamoDB Document row vs. Aurora Document row**: the proposal puts the `Document` row in DynamoDB because Aurora only has `public.embeddings` from WI-004. **Mitigation:** acceptable for MVP; a follow-up WI migrates the `Document` table to Aurora alongside the rest of the entity tables. The schema in `data-model.md` is the target; the implementation lag is documented in the README.

## Validation

Run after the branch is implemented and pushed (no force-push, no `git commit --amend` on shared branches):

- `pnpm install` at the repo root — resolves the new ingest dependencies in `apps/functions` and the CDK additions.
- `pnpm -F infra synth` — CloudFormation template synthesizes cleanly; the four new resources appear.
- `pnpm -F infra test` — vitest CDK assertions green, including the new bucket, Lambda, rule, and unique-index tests.
- `pnpm -F functions type-check` — `tsc --noEmit` exits 0 on the new modules.
- `pnpm -F functions test` — vitest green across legacy + new test cases.
- `pnpm lint` at the repo root — 0 errors on `apps/functions/src/ingest/` and on the new admin route files.
- `kaddo guard` — 0 findings, 0 fyi. (If findings appear, treat them as knowledge drift: read, decide, then update `knowledge/tech/decisions/004-aws-service-selection-for-ai-capabilities.md` and `data-model.md` accordingly. The proposal deliberately references ADR-004 by name so drift on the chunk size / model id / parser choice is the most likely finding and is addressed by updating the ADR, not by re-architecting.)
- `kaddo questions` — no new blocking question that this WI should have resolved. (DC-005-1 is resolved via WI-008; the remaining 4 open questions are DC-005-2..5 and the WI ships when all four are either resolved or explicitly deferred by the founder.)
- `kaddo impact RM-001 WI-005` — the impact report lists the new files, the modified `server.ts`, the new `infra/lib/` constructs, and the new env vars. The expected-value line ("A document uploaded via the admin API becomes a set of `public.embeddings` rows within 60 s, idempotently") is the green-bar sentence the impact report should reflect.

**Green-bar criteria (all must be true):**

1. The CDK template synthesizes with the four new resources and the unique-index SQL.
2. `pnpm -F functions test` and `pnpm -F infra test` are green.
3. `kaddo guard` is green.
4. A manual end-to-end smoke (documented in `apps/functions/README.md`) uploads a 4-page PDF and observes `Document.status: ready` plus the expected `embeddings` row count within 60 s.
5. The README documents the tenant-isolation invariant, the chunk size / overlap defaults, and the DLQ + marker-file failure mode.

## Open Questions

All decision candidates for this WI are resolved (2026-08-28). The WI is eligible to move from `draft` to `ready` once its implementation tasks begin.

1. **DC-005-1 — Sub → company_id mapping location — RESOLVED (2026-08-28, founder decision: option D).** The mapping lives in WI-008: its post-confirmation Lambda is the sole writer of the immutable `custom:company_id` attribute, SignUp rejects client-supplied values for it, and the pre-token-generation Lambda copies the claim server-side. `resolveTenant` (T-07) reads the JWT claim directly and documents the custody chain in a comment referencing WI-008's two new acceptance criteria. Migration path to a DynamoDB `users` table is documented for the future multi-org case (single-module change in `resolveTenant`).
2. **DC-005-2 — Bedrock model id exact string — RESOLVED (2026-08-28, founder decision: `amazon.titan-embed-text-v2:0` 8k context default).** The env var `BEDROCK_EMBED_MODEL_ID` carries the value; no regional suffix. The model is enabled in the baseline region (us-east-1). If a longer context is needed later, the env var is the only change.
3. **DC-005-3 — Chunk size + overlap defaults — RESOLVED (2026-08-28, founder decision: 1000 chars / 200 overlap).** Env vars `CHUNK_SIZE=1000` and `CHUNK_OVERLAP=200`. Tunable per chatbot at deploy time. Cost estimate: ~1500 chunks / 10 MB PDF, ~$0.005 / doc.
4. **DC-005-4 — S3 bucket placement — RESOLVED (2026-08-28, founder decision: bucket lives in WI-005).** `infra/lib/ingest-bucket.ts` is added to this WI. WI-004 stays focused on Aurora+pgvector+proxy.
5. **DC-005-5 — RDS connection path for the Lambda — RESOLVED (2026-08-28, founder decision: RDS Data API for v1).** No connection management, IAM auth, faster cold start. If the `::vector` cast is rejected by the Data API SQL dialect during implementation, switch to `pg` through the proxy; the choice is a single env var (`DB_CONNECTION_MODE=data_api|pg_proxy`).

## Related Files (paths only, no code)

- `apps/functions/src/api/documentsUpload.ts` — `POST /api/chatbots/:chatbotId/documents` factory.
- `apps/functions/src/api/documentsList.ts` — `GET /api/chatbots/:chatbotId/documents` factory.
- `apps/functions/src/api/documentGet.ts` — `GET /api/documents/:documentId` factory.
- `apps/functions/src/api/__tests__/documentsUpload.test.ts`
- `apps/functions/src/api/__tests__/documentsList.test.ts`
- `apps/functions/src/api/__tests__/documentGet.test.ts`
- `apps/functions/src/ingest/types.ts` — shared types (`IngestEvent`, `Chunk`, `EmbeddingRow`, `IngestError`).
- `apps/functions/src/ingest/parsePdf.ts`
- `apps/functions/src/ingest/parseDocx.ts`
- `apps/functions/src/ingest/parseText.ts`
- `apps/functions/src/ingest/splitter.ts`
- `apps/functions/src/ingest/embedBedrock.ts`
- `apps/functions/src/ingest/persistEmbeddings.ts`
- `apps/functions/src/ingest/resolveTenant.ts`
- `apps/functions/src/ingest/logger.ts`
- `apps/functions/src/ingest/__tests__/parsePdf.test.ts`
- `apps/functions/src/ingest/__tests__/parseDocx.test.ts`
- `apps/functions/src/ingest/__tests__/parseText.test.ts`
- `apps/functions/src/ingest/__tests__/splitter.test.ts`
- `apps/functions/src/ingest/__tests__/embedBedrock.test.ts`
- `apps/functions/src/ingest/__tests__/persistEmbeddings.test.ts`
- `apps/functions/src/ingest/__tests__/resolveTenant.test.ts`
- `apps/functions/src/server.ts` — modified to register the three new admin routes.
- `apps/functions/.env.example` — modified to declare new ingest env vars.
- `apps/functions/README.md` — modified to document the S3 → EventBridge → Lambda contract and the tenant-isolation invariant.
- `infra/lib/ingest-bucket.ts` — new S3 bucket construct.
- `infra/lib/ingest-lambda.ts` — new Lambda construct.
- `infra/lib/ingest-eventbridge-rule.ts` — new EventBridge rule construct.
- `infra/lib/ingest-embeddings-index.ts` — new custom resource for the unique index.
- `infra/lib/chat-saas-stack.ts` — modified to wire the four new constructs.
- `infra/test/ingest-bucket.test.ts`
- `infra/test/ingest-lambda.test.ts`
- `infra/test/ingest-eventbridge-rule.test.ts`
- `infra/test/chat-saas-stack.test.ts` — modified to add assertions for the new resources.
- `infra/README.md` — modified to document the new env vars and the deploy smoke test.
- `tasks/WI-005-ingest-pipeline-tasks.yml` — task list, format mirrored on `tasks/WI-004-cdk-app-bootstrap-tasks.yml`.
- `knowledge/delivery/work-items/draft/WI-005-ingest-pipeline.md` — this file, once promoted from `/tmp/`.
- `knowledge/tech/decisions/004-aws-service-selection-for-ai-capabilities.md` — read-only; the entire design of this WI is downstream of this ADR.
- `knowledge/tech/discovery/decision-candidates.md` — modified to add the remaining 4 open questions as `DC-005-2..5` (DC-005-1 is resolved and closed).

## Next WIs (not in this WI)

- **WI-006 — Retrieval + chat handler.** The pgvector query (`SELECT ... WHERE chatbot_id = $1 AND company_id = $2 ORDER BY embedding <=> $3 LIMIT 10`) + Bedrock Claude 3.5 Sonnet completion + conversation persistence + credit debit on completion. Depends on this WI.
- **WI-007 — Cost metering job.** Nightly aggregation of `Document.metadata.ingest.byte_count` into `UsageMetric.document_processing_volume`. Depends on this WI.
- **WI-008 — Operator's Board UI.** The `apps/web/` upload widget, document list, and status polling. Depends on WI-006's read paths being stable. (Placeholders; the WI round is finalized by the parent after this WI ships.)

## Sister WIs in this round

- **WI-004** (`ready/`) — `CDK app bootstrap with Aurora Serverless v2 + pgvector + RDS Proxy`. Dependency direction: **WI-004 → WI-005**. WI-004 ships the `public.embeddings` table that this WI writes into. WI-004 is a hard prerequisite.
- **WI-005** (this WI, `draft/`).
- **WI-006** (placeholder) — Retrieval + chat handler. Dependency direction: **WI-005 → WI-006**. WI-006 reads the rows this WI writes.
- **WI-007** (placeholder) — Cost metering. Dependency direction: **WI-005 → WI-007** for the byte-count field; **WI-006 → WI-007** for the conversation counter.
- **WI-008** (placeholder) — Operator's Board UI. Dependency direction: **WI-005 → WI-008** for the upload widget, **WI-006 → WI-008** for the chat widget.

## Sister-WI placement in the round

The dependency graph in the round is linear at the top: **WI-004 → WI-005 → WI-006**. WI-007 fans out from both WI-005 and WI-006. WI-008 sits at the leaf. This WI is the second of four implementation WIs in the round and the first one that touches Bedrock at runtime.
