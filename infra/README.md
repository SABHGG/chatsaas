# chatSaaS Infra (AWS CDK)

Infrastructure as code for the chatSaaS data plane: ingest pipeline (S3 → EventBridge → Lambda → Bedrock → Neon pgvector), documents table, and identity (Cognito).

Per **ADR-008** (WI-004), the vector store is **Neon** (serverless Postgres + pgvector). There is **no Aurora, no RDS Proxy, no Secrets Manager, and no VPC** in this stack — Lambdas run outside any VPC and reach Neon over TLS.

## Stack composition

| Concern | Resource | Notes |
| --- | --- | --- |
| Vector store | Neon project (external, us-east-1) | schema applied by `infra/db/migrations/001-embeddings-pgvector.sql` |
| Connection | `@neondatabase/serverless` (HTTP driver) | pooled `-pooler` endpoint; URL read from SSM at runtime |
| Credentials | SSM SecureString `chatsaas-{env}-neon-url` | least-privilege `ssm:GetParameter` grant |
| Documents | S3 bucket + DynamoDB `documents` table | unchanged (WI-005) |
| Orchestration | EventBridge rule on `s3:ObjectCreated:Put` | DLQ + 3 retries |
| Identity | Cognito user pool (WI-008) | unchanged |

Stack outputs: `NeonUrlParameterName`, `EmbeddingsTableName`, `DocumentsBucketName`, `DocumentsTableName`, `IngestLambdaName`, `IngestDlqUrl`, and the Cognito outputs. (Aurora-era outputs `ClusterEndpoint` / `ClusterArn` / `ProxyEndpoint` / `ProxyArn` / `SecretArn` / `DatabaseName` were removed with WI-004.)

## Neon dev project

- **Region**: `us-east-1` (proximity to S3/Bedrock; same as the stack).
- **Branch**: `main` (the default branch; dev/test branches fork from it at no extra cost).
- **Project ID**: _record from the Neon console → Project settings_ (`TODO(WI-004): fill in the project id`).
- **Endpoint (pooled)**: `ep-muddy-grass-au24uyng-pooler.c-10.us-east-1.aws.neon.tech` — hostname includes `-pooler` (PgBouncer); always use the pooled endpoint from Lambda.
- **Database / role**: `neondb` / `neondb_owner`.
- The pooled connection string lives locally in `apps/functions/.env` and `infra/.env` as `NEON_DATABASE_URL` (gitignored — never commit it).

> Free-plan caveats: autosuspend after ~5 min idle means the first query pays a compute wake-up; 0.5 GB storage cap on the dev project.

## Runbook: apply the pgvector migration

The embeddings schema (`public.embeddings`, HNSW index, unique `(chatbot_id, content_sha256)` index) is applied by a **migration script**, not a CDK custom resource. `cdk deploy` does **not** apply it — run it manually (or from CI) once per environment/branch:

```bash
# Prereq: NEON_DATABASE_URL in apps/functions/.env (pooled endpoint, main branch)
pnpm --filter @chatsaas/functions exec node --env-file-if-exists=.env \
  scripts/run-neon-migration.mjs
```

The script splits `infra/db/migrations/001-embeddings-pgvector.sql` into statements and executes them via `@neondatabase/serverless` over HTTPS (same driver as the ingest Lambda), then prints verification output:

- `extension: ["vector"]`
- `table: ["embeddings"]`
- `indexes: ["embeddings_chatbot_company_idx", "embeddings_chatbot_content_sha256_idx", "embeddings_embedding_hnsw_idx"]`

Every statement is idempotent (`IF NOT EXISTS`), so re-running is safe.

New migrations go in `infra/db/migrations/` named `NNN-<slug>.sql`.

## Runbook: store the Neon URL in SSM

The ingest Lambda never sees the URL at deploy time. It reads the parameter name from env (`NEON_URL_PARAMETER_NAME`) and fetches the value at runtime with `ssm:GetParameter` (decrypt). Create the SecureString once per environment:

```bash
aws ssm put-parameter \
  --name "chatsaas-dev-neon-url" \
  --type "SecureString" \
  --value "postgresql://<user>:<password>@ep-muddy-grass-au24uyng-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require" \
  --region us-east-1
```

- Use the **pooled** connection string (hostname contains `-pooler`).
- The default AWS-managed key (`aws/ssm`) needs no extra `kms:Decrypt` grant; the Lambda role is granted `ssm:GetParameter` on `parameter/chatsaas-dev-neon-url` only.
- To rotate the credential: update the Neon role password, then `aws ssm put-parameter --overwrite`.

> Status (WI-004): **pending manual** — the sandbox (`apps/functions/.env`) points to floci, not a real AWS account, so the parameter was not created by this work item. Run the command above against the real account/region before deploying.

## Runbook: DB-layer smoke test

After the migration, verify insert + idempotency against Neon (no AWS needed):

1. Insert a test embedding row (1024-dim vector).
2. Re-insert the same `(chatbot_id, content_sha256)` → `ON CONFLICT DO NOTHING` must keep `insertedCount` at 0.
3. Delete the test row.

The ingest end-to-end smoke (upload fixture → Lambda → Neon) additionally requires a real AWS account (floci cannot emulate Neon) — pending manual validation before merge.

## Local development

- `pnpm --filter @chatsaas/infra synth` — synthesize the template (no AWS access needed).
- `pnpm --filter @chatsaas/infra test` — vitest + CDK assertions.
- `pnpm --filter @chatsaas/functions test` — handler/unit tests (mocked clients).
