---
type: feature
id: WI-004
title: "CDK app bootstrap with Aurora Serverless v2 + pgvector + RDS Proxy"
knowledge_level: K2
status: ready
phase: now
branch: feature/post-wi-003-rag-infra
initiative: "RM-001"
created_at: "2026-08-28"
source: post-wi-003-decisions
source_id: post-wi-003-decisions-2026-08-28
source_title: "CDK app bootstrap with Aurora Serverless v2 + pgvector"
source_context: "Derived from the post-WI-003 decision set (Q1 Aurora + pgvector committed in ADR-004, Q3 ordered as Infra/CDK → Bedrock+RAG → Frontend). The current monorepo has CDK 2.266.0 declared in the ADR-003 stack but no CDK app, no infra stack files, and no `infra/` skeleton beyond the placeholder package.json. Without this WI, the Bedrock + pgvector RAG layer (WI-005+) has nothing to deploy against and no place to run the HNSW-indexed embeddings table."
source_initiative: "Public Document-Grounded Chatbot"
expected_value: "A runnable `aws-cdk` TypeScript app at `infra/` that synthesizes a stack containing: (1) Aurora Serverless v2 cluster (PostgreSQL 16, 0.5–4 ACU), (2) the `vector` extension enabled on the database, (3) a `public.embeddings` table created via a post-deployment custom resource with an HNSW index on the embedding column, (4) an RDS Proxy in front of the cluster, (5) a Secrets Manager secret for the database credential with 7-day rotation, (6) parameter group, subnet group, and security group with the minimal inbound rules. `pnpm -F infra synth` produces a clean CloudFormation template. `pnpm -F infra test` runs vitest against the stack using `aws-cdk-lib/assertions` and passes."
risks:
  - "Aurora Serverless v2 has a minimum 0.5 ACU; cost in dev is non-zero even with low utilization. Acceptable for MVP."
  - "Region availability: Bedrock is not in every AWS region. The stack must target a region where Bedrock is available (us-east-1 or us-west-2 baseline). pgvector is region-agnostic once the extension is enabled."
  - "Custom resource for table creation is the right pattern but adds a Lambda dependency; we will keep the resource inline to the stack to avoid cross-stack references."
  - "RDS Proxy IAM auth is the default path; password auth is left as a fallback for the local dev variant."
  - "Local dev without a real Aurora cluster is out of scope. Tests use CDK assertions against the synthesized template, not against a live cluster."
  - "Secrets Manager rotation is wired but the rotation Lambda is a placeholder — the actual rotation hook is left for a follow-up WI."
dependencies:
  - "WI-002 (completed) — establishes the Fastify handler pattern the API layer will follow."
  - "WI-003 (completed) — establishes the Cognito JWT verifier pattern and the server bootstrap shape."
  - "ADR-001 (Use Amazon Cognito for User Authentication) — already accepted."
  - "ADR-003 (Technology Stack Selection) — aws-cdk 2.266.0 is the chosen IaC framework."
  - "ADR-004 (AWS Service Selection for AI Capabilities, 2026-08-28 revision) — Aurora + pgvector + Bedrock + in-Lambda parsers."
  - "`@aws-sdk/client-rds`, `aws-cdk-lib/aws-rds`, `aws-cdk-lib/aws-secretsmanager`, `aws-cdk-lib/aws-ec2`, `aws-cdk-lib/custom-resources` must be available; this WI adds the deps to `infra/package.json`."
code:
  - "infra/app.ts"
  - "infra/lib/chat-saas-stack.ts"
  - "infra/lib/aurora-pgvector.ts"
  - "infra/lib/rds-proxy.ts"
  - "infra/lib/embeddings-table-resource.ts"
  - "infra/test/chat-saas-stack.test.ts"
  - "infra/cdk.json"
  - "infra/package.json"
---

# WI-004: CDK app bootstrap with Aurora Serverless v2 + pgvector + RDS Proxy

## Goal

Land a runnable AWS CDK app that synthesizes the infrastructure foundation for the chatSaaS RAG layer: an Aurora Serverless v2 cluster with the `pgvector` extension, a `public.embeddings` table with an HNSW index, an RDS Proxy in front, and a Secrets Manager secret with rotation. This is the **first implementation WI of the post-WI-003 decision set** (Q1 Aurora+pgvector, Q3 Infra-first ordering).

## Scope

In scope:

- New `infra/` TypeScript CDK app under the existing pnpm workspace.
- One stack: `ChatSaaSStack` (dev). A prod stack is left for a follow-up WI.
- Aurora Serverless v2 cluster: PostgreSQL 16, 0.5–4 ACU, single DB instance, public subnets disabled.
- `vector` extension enabled on the database via a CDK custom resource.
- `public.embeddings` table created via the same custom resource. Columns: `id` (UUID PK), `chatbot_id` (UUID, NOT NULL), `company_id` (UUID, NOT NULL), `content` (TEXT, NOT NULL), `embedding` (`vector(1024)`, NOT NULL), `created_at` (TIMESTAMPTZ, default `now()`).
- HNSW index on `embedding` using `vector_cosine_ops`.
- Composite B-tree index on `(chatbot_id, company_id)` for the multi-tenant filter.
- RDS Proxy in front of the cluster, IAM auth on, target group bound to the writer.
- Secrets Manager secret for the database master credential, 7-day rotation, rotation Lambda stub.
- Security group: only the RDS Proxy SG can reach the cluster on 5432. Lambda SG references the proxy SG.
- Subnet group referencing the two private subnets of the existing VPC.
- Vitest tests using `aws-cdk-lib/assertions` that verify the template contains the expected resources, the `vector` extension is enabled, and the HNSW index is in the custom resource SQL.
- `infra/package.json` with the runtime deps (`aws-cdk-lib`, `constructs`, `@aws-sdk/client-rds-data`).
- `pnpm -F infra synth` runs cleanly.
- `pnpm -F infra test` runs the vitest suite, all green.

Out of scope:

- Cognito User Pool provisioning (handled by a separate WI; this WI assumes it exists or is provisioned manually for now).
- Bedrock Knowledge Base wiring (WI-005).
- Ingest pipeline / parsers (WI-005).
- API Gateway HTTP API wiring (already in the WI-003 server bootstrap shape; stack-level wiring in a follow-up).
- Production stack, multi-region, cross-account replicas.
- Local dev without a real Aurora cluster.
- Rotation Lambda implementation (rotation is wired, the hook is a stub).

## Acceptance Criteria

1. `pnpm install` at the repo root resolves the new `infra` workspace.
2. `cd infra && pnpm synth` produces a CloudFormation template that includes:
   - `AWS::RDS::DBCluster` of engine `aurora-postgresql` and engine version `16.x`.
   - `AWS::RDS::DBClusterParameterGroup` with `shared_preload_libraries` including `vector`.
   - A custom resource Lambda function whose inline code contains `CREATE EXTENSION IF NOT EXISTS vector;` and `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);`.
   - `AWS::RDS::DBProxy` in front of the cluster.
   - `AWS::SecretsManager::Secret` with `RotationRules: { AutomaticallyAfterDays: 7 }`.
3. `pnpm -F infra test` runs vitest and all assertions pass.
4. `pnpm type-check` at the repo root passes.
5. The `infra/README.md` documents the deploy command, the prerequisites (Bedrock-enabled region, CDK bootstrapped account), and the expected outputs (cluster endpoint, proxy endpoint, secret ARN).
6. The custom resource is idempotent: re-running `cdk deploy` does not fail if the table or index already exist (uses `IF NOT EXISTS`).
7. The embeddings table includes `chatbot_id` and `company_id` columns. The test asserts both are present in the custom resource SQL.

## Tasks

See `tasks/WI-004-cdk-app-bootstrap-tasks.yml` for the full task list.

## Risks and Mitigations

- **Aurora Serverless v2 minimum cost**: 0.5 ACU floor. For dev we accept it; for staging we will use `auto-pause` once it becomes generally available for Serverless v2 (2026 — check before standing up the staging stack).
- **Region with Bedrock**: the stack will be parameterized to accept `--context region=...` and the README will warn if the target region is not on the Bedrock availability list.
- **RDS Proxy cold start**: first invocation through the proxy can add 100–300ms. Acceptable for an MVP; mitigated by provisioned concurrency on the proxy if/when needed.
- **pgvector ≤ 2000 dims**: locked at 1024 for the column. Future schema migrations to a larger dimension require an offline rewrite, not a column type change.
- **Custom resource drift**: if the table is modified outside CDK, the next `cdk deploy` will succeed (the resource uses `IF NOT EXISTS`) but the drift will not be detected. We will add a manual `psql` smoke test in the README to detect drift post-deploy.

## Validation

- `pnpm -F infra synth` → clean template, no errors.
- `pnpm -F infra test` → vitest suite green.
- `pnpm type-check` at the root → 0 errors.
- `pnpm lint` at the root → 0 errors on `infra/`.
- `kaddo guard` → 0 findings, 0 fyi.
- `kaddo questions` → no new blocking questions.

## Related Files

- `infra/app.ts` — CDK app entry point.
- `infra/lib/chat-saas-stack.ts` — main stack composition.
- `infra/lib/aurora-pgvector.ts` — Aurora cluster construct, includes the vector extension.
- `infra/lib/rds-proxy.ts` — RDS Proxy construct.
- `infra/lib/embeddings-table-resource.ts` — custom resource that creates the `public.embeddings` table and HNSW index.
- `infra/test/chat-saas-stack.test.ts` — vitest suite using CDK assertions.
- `infra/cdk.json` — CDK configuration.
- `infra/package.json` — runtime and dev deps for the `infra` workspace.
- `infra/README.md` — deploy instructions, prerequisites, expected outputs.
- `knowledge/tech/decisions/004-aws-service-selection-for-ai-capabilities.md` — the ADR this WI implements.
- `knowledge/tech/discovery/decision-candidates.md` — closed entries for Q1/Q2/Q3.

## Next WIs (not in this WI)

- **WI-005**: Ingest pipeline (parsers + Bedrock embeddings + pgvector upsert).
- **WI-006**: Retrieval + chat handler (pgvector query + Bedrock completion + tokens metering).
- **WI-007**: Frontend Operator's Board dashboard.
