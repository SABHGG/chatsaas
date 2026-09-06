---
type: feature
id: WI-004
title: "CDK app bootstrap with Neon pgvector (Aurora retired)"
knowledge_level: K2
status: ready
phase: now
branch: feature/WI-004-neon-vector-store
initiative: "RM-001"
created_at: "2026-08-28"
updated_at: "2026-09-05"
source: ADR-008
source_id: adr-008-2026-09-05
source_title: "Use Neon for the Vector Store (ADR-008)"
source_context: "Re-scoped on 2026-09-05 from the original Aurora Serverless v2 + RDS Proxy bootstrap to ADR-008 (Neon replaces Aurora as the vector store). The Aurora path had a ~$44/mo floor (0.5 ACU) plus RDS Proxy plus potential NAT (~$90–120/mo total), VPC/security-group complexity, and a latent deploy bug (the stack selected `PRIVATE_WITH_EGRESS` subnets that do not exist in a default VPC). Neon removes all of it: pooled `-pooler` endpoint, SSM SecureString for the connection string, non-VPC Lambdas. The embeddings schema (table, HNSW index, unique `(chatbot_id, content_sha256)` index) is unchanged and moves from custom resources to a migration script."
source_initiative: "Public Document-Grounded Chatbot"
expected_value: "The data plane runs on Neon (serverless Postgres with pgvector): a Neon project (us-east-1, `main` branch) holds the `public.embeddings` table with its HNSW index and the unique `(chatbot_id, content_sha256)` index, applied by a migration script; the pooled connection string lives in SSM SecureString `chatsaas-{env}-neon-url`; the ingest Lambda runs outside any VPC, reads the connection string via least-privilege `ssm:GetParameter`, and writes embeddings through `@neondatabase/serverless`. The Aurora-era constructs (`aurora-pgvector.ts`, `rds-proxy.ts`, `database-secret.ts`, `security-groups.ts`, `vpc.ts`, `embeddings-table-resource.ts`, `ingest-embeddings-index.ts`) and all their stack wiring are deleted. DynamoDB, S3, Cognito, and EventBridge remain as-is. `cdk synth` produces a template with NO `AWS::RDS::*` and NO VPC/EC2 data-plane resources; the vitest suite is green."
risks:
  - "Neon autosuspend cold start: after ~5 min idle the first query pays a compute wake-up latency. Acceptable for dev/MVP; the retrieval path should document the first-query penalty."
  - "0.5 GB storage cap on the Neon Free plan. The dev project stays under it; early prod uses the Launch plan ($0.106/CU-hour + $0.35/GB-month, no monthly minimum)."
  - "floci cannot emulate Neon: the migration and the ingest smoke test require a real Neon free project (manual validation step, not CI)."
  - "Bundling `@neondatabase/serverless` with esbuild: the driver is fetch-based ESM; verify the Lambda bundling config and run one smoke invocation before merge."
dependencies:
  - "WI-002 (completed) — establishes the Fastify handler pattern the API layer will follow."
  - "WI-003 (completed) — establishes the Cognito JWT verifier pattern and the server bootstrap shape."
  - "WI-005 (completed) — the ingest pipeline this WI re-wires to Neon."
  - "ADR-001 (Use Amazon Cognito for User Authentication) — already accepted."
  - "ADR-003 (Technology Stack Selection) — aws-cdk is the chosen IaC framework."
  - "ADR-008 (Use Neon for the Vector Store, 2026-09-05) — Neon replaces the Aurora/RDS Proxy data plane; supersedes the vector-storage, connection-management, and credentials portions of ADR-004."
  - "`@neondatabase/serverless` must be added to the ingest Lambda bundle; `@aws-sdk/client-rds-data`, `aws-cdk-lib/aws-rds`, `aws-cdk-lib/aws-secretsmanager`, and `aws-cdk-lib/aws-ec2` dependencies are removed from the data-plane path."
code:
  - "infra/app.ts"
  - "infra/lib/chat-saas-stack.ts"
  - "infra/lib/ingest-lambda.ts"
  - "infra/lib/ingest-bucket.ts"
  - "infra/lib/ingest-eventbridge-rule.ts"
  - "infra/db/migrations/001-embeddings-pgvector.sql (new — migration script porting the embeddings SQL)"
  - "infra/test/chat-saas-stack.test.ts"
  - "infra/test/ingest-lambda.test.ts"
  - "infra/cdk.json"
  - "infra/package.json"
---

# WI-004: CDK app bootstrap with Neon pgvector (Aurora retired)

## Goal

Provision the data plane on **Neon** (serverless Postgres with pgvector) per ADR-008: wire ingest to Neon from non-VPC Lambdas, delete the Aurora-era constructs, and keep DynamoDB, S3, Cognito, and EventBridge as-is. The embeddings schema — `public.embeddings`, HNSW index, unique `(chatbot_id, content_sha256)` index — is unchanged; only where it lives and how it is reached changes.

## Scope

In scope:

- Neon project (us-east-1) with the `main` branch. The pooled connection string (hostname includes `-pooler`) is stored in SSM Parameter Store as a SecureString named `chatsaas-{env}-neon-url`.
- Migration script applying, in idempotent statements:
  - `CREATE EXTENSION IF NOT EXISTS vector;`
  - `public.embeddings` table — SQL ported from `infra/lib/embeddings-table-resource.ts` (`EMBEDDINGS_TABLE_SQL`): `id` UUID PK, `chatbot_id` UUID NOT NULL, `company_id` UUID NOT NULL, `content` TEXT NOT NULL, `embedding vector(1024)` NOT NULL, `created_at` TIMESTAMPTZ default `now()`.
  - HNSW index on `embedding` using `vector_cosine_ops` and the composite B-tree index on `(chatbot_id, company_id)`.
  - `content_sha256` column and the unique `(chatbot_id, content_sha256)` index — SQL ported from `infra/lib/ingest-embeddings-index.ts` (`EMBEDDINGS_UNIQUE_INDEX_SQL`).
  - A runbook section in `infra/README.md` documenting how to run the migration against the Neon `main` branch.
- DELETE the Aurora-era constructs and all their stack wiring: `infra/lib/aurora-pgvector.ts`, `infra/lib/rds-proxy.ts`, `infra/lib/database-secret.ts`, `infra/lib/security-groups.ts`, `infra/lib/vpc.ts`, `infra/lib/embeddings-table-resource.ts`, `infra/lib/ingest-embeddings-index.ts`.
- Ingest Lambda (`infra/lib/ingest-lambda.ts`):
  - Remove `vpc` / `vpcSubnets` / `securityGroups` props — the Lambda is non-VPC; every AWS service call (S3, DynamoDB, Bedrock, SSM) uses public endpoints.
  - Replace the `rds-data:ExecuteStatement` IAM statement with least-privilege `ssm:GetParameter` on the Neon URL parameter.
  - Swap the handler DB calls to `@neondatabase/serverless` (fetch-based HTTP driver preferred) over the pooled endpoint; preserve the `INSERT ... ON CONFLICT (chatbot_id, content_sha256) DO NOTHING` semantics.
- Update `infra/test/`: no `DBCluster` / `DBProxy` / VPC assertions; assert the SSM grant and the no-VPC Lambda config instead.
- Keep stack outputs updated: no ClusterEndpoint / ProxyArn / SecretArn; add `NeonUrlParameterName`.
- DynamoDB, S3, Cognito, EventBridge stay as-is.

Out of scope:

- Retrieval-path code changes (WI-006 reads Neon; its completed record notes the supersession).
- Cognito User Pool provisioning (separate WI).
- Bedrock Knowledge Base wiring (WI-005).
- Production Neon project, branching strategy for staging, multi-region.
- Rotation Lambda implementation (the concept is deleted along with Secrets Manager).

## Acceptance Criteria

1. `cdk synth` produces NO `AWS::RDS::*` and NO VPC/EC2 data-plane resources.
2. The ingest Lambda config has no `vpc` / `vpcSubnets` / `securityGroups`.
3. The Neon URL is resolved from SSM with least-privilege `ssm:GetParameter` on the `chatsaas-{env}-neon-url` parameter only.
4. The migration script applies pgvector + the `public.embeddings` table + the HNSW index + the unique `(chatbot_id, content_sha256)` index on a Neon dev project.
5. The ingest smoke test writes embeddings to Neon end-to-end (real Neon free project; floci cannot emulate Neon).
6. The vitest suite (`pnpm -F infra test`) is green.

## Tasks

See `tasks/WI-004-cdk-app-bootstrap-tasks.yml` for the full task list.

## Risks and Mitigations

- **Neon autosuspend cold start**: after ~5 min idle, the first query pays a compute wake-up latency. Acceptable for MVP; document the first-query penalty in the retrieval README.
- **0.5 GB Free storage cap**: the dev project stays under it; moving to the Launch plan is a billing toggle, not a code change.
- **floci cannot emulate Neon**: the migration + ingest smoke require a real Neon free project. This is a manual validation step outside CI.
- **`@neondatabase/serverless` bundling with esbuild**: the driver is fetch-based ESM; verify the Lambda bundling config and run one smoke invocation before merge.

## Validation

- `cdk synth` → clean template with no `AWS::RDS::*`, no VPC/EC2 data-plane resources, and the `NeonUrlParameterName` output.
- `pnpm -F infra test` → vitest suite green.
- `pnpm type-check` at the root → 0 errors.
- Migration script run against the Neon dev project → pgvector extension, table, HNSW index, and unique index all applied.
- Ingest smoke test → embeddings rows land in Neon end-to-end.
- `kaddo guard` → 0 findings, 0 fyi.
- `kaddo questions` → no new blocking questions.

## Related Files

- `infra/app.ts` — CDK app entry point.
- `infra/lib/chat-saas-stack.ts` — main stack composition (Aurora-era wiring removed).
- `infra/lib/ingest-lambda.ts` — ingest Lambda construct (de-VPC, SSM grant, Neon driver).
- `infra/lib/ingest-bucket.ts` — documents S3 bucket (unchanged).
- `infra/lib/ingest-eventbridge-rule.ts` — EventBridge rule (unchanged).
- `infra/db/migrations/001-embeddings-pgvector.sql` — new migration script (pgvector extension, table, HNSW + unique indexes).
- `infra/test/chat-saas-stack.test.ts` — vitest suite using CDK assertions (no RDS/VPC assertions).
- `infra/test/ingest-lambda.test.ts` — asserts no-VPC config + SSM grant.
- `infra/cdk.json` — CDK configuration.
- `infra/package.json` — workspace deps (`@neondatabase/serverless` added; RDS-era deps removed).
- `infra/README.md` — Neon setup, SSM parameter, and migration runbook.
- `knowledge/tech/decisions/008-use-neon-for-vector-store.md` — the ADR this WI implements.
- `knowledge/tech/decisions/004-aws-service-selection-for-ai-capabilities.md` — partially superseded by ADR-008.
- `knowledge/tech/discovery/decision-candidates.md` — closed entries for Q1/Q2/Q3 (annotated).

## Next WIs (not in this WI)

- **WI-005** (completed): ingest pipeline — re-wired to Neon by this WI; the writer path swaps from RDS Data API to `@neondatabase/serverless`.
- **WI-006** (completed): retrieval + chat — retrieval now reads Neon; the completed record notes the supersession (Aurora/RDS Proxy path → Neon pooled endpoint).
- **WI-007**: Frontend Operator's Board dashboard.

## Superseded history

This WI was originally scoped as "CDK app bootstrap with Aurora Serverless v2 + pgvector + RDS Proxy" (ADR-004, 2026-08-28) and re-scoped to Neon on 2026-09-05 (ADR-008). The two deploy blockers recorded against the Aurora path — Judgment Day 2026-09-01, target `b885002870bd8a6d`:

- `infra/lib/aurora-pgvector.ts` instantiated `ServerlessCluster` (Aurora Serverless **v1**, synthesized EngineMode `serverless`) with engine `AuroraPostgresEngineVersion.VER_16_4` — v1 supports only PostgreSQL 10.x, so RDS rejected the cluster at deploy time.
- `infra/lib/security-groups.ts` LambdaSG (`allowAllOutbound: false`) only permitted 5432 egress to the proxy SG, but the Lambdas attached to it also needed HTTPS 443 outbound for RDS Data API, S3, DynamoDB, and Bedrock — runtime egress timeouts as synthesized.

— are **moot under Neon**: the cluster construct and every security group are deleted; the only database is Neon reached over TLS from non-VPC Lambdas.
