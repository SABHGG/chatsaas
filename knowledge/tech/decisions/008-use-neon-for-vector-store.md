---
type: decision
status: accepted
date: 2026-09-05
---

# ADR-008: Use Neon for the Vector Store

## Context

ADR-004 (2026-08-28) selected **Aurora Serverless v2 + pgvector** as the vector store, fronted by **RDS Proxy**, with credentials in **Secrets Manager** (7-day rotation) and Lambda access over the **RDS Data API**. Re-scoping that path surfaced three compounding problems:

- **Cost floor**: Aurora Serverless v2 has a 0.5 ACU minimum (~$44/mo before any traffic). Adding RDS Proxy, plus NAT if Lambda egress to AWS public endpoints is required, puts the realistic floor at ~$90–120/mo — for a dev environment that sits idle most of the day.
- **VPC complexity**: the path required a VPC, three security groups (Lambda, proxy, cluster), a Secrets Manager rotation Lambda, and custom resources whose Lambdas speak the RDS Data API. Every AWS service call from inside the VPC (S3, DynamoDB, Bedrock) would need NAT or interface endpoints.
- **Latent deploy bug**: the stack selected `SubnetType.PRIVATE_WITH_EGRESS` subnets that do not exist in a default VPC, so `cdk deploy` would fail on a fresh account before the cost question even mattered.

## Decision

Use **Neon** (serverless Postgres with the pgvector extension) for vector storage and all Postgres workloads. Lambdas run **outside any VPC** and reach Neon over TLS using the pooled `-pooler` connection string (built-in PgBouncer) or the Neon HTTP driver (`@neondatabase/serverless`). The Neon connection string is stored as an SSM Parameter Store **SecureString** (free) instead of Secrets Manager.

This decision **supersedes the vector-storage (Aurora Serverless v2), connection-management (RDS Proxy), and credentials (Secrets Manager rotation) portions of ADR-004**. The Bedrock model selection, in-Lambda parsers, and Lambda orchestration decisions from ADR-004 remain in force.

### Components

- **Vector store**: a Neon project (us-east-1 default) with the `main` branch, pgvector enabled, and an HNSW index. The `public.embeddings` schema (columns, HNSW index, `content_sha256` + unique `(chatbot_id, content_sha256)` index) is unchanged; it is applied by a migration script instead of Aurora-era custom resources.
- **Connection path**: non-VPC Lambdas use `@neondatabase/serverless` (fetch-based HTTP driver, preferred) or `pg` over the pooled `-pooler` endpoint. No RDS Proxy, no security groups, no NAT.
- **Credentials**: the pooled connection string lives in SSM SecureString `chatsaas-{env}-neon-url`, read with least-privilege `ssm:GetParameter`.

### Why Neon

- **Verified pricing (figures checked 2026-09-05)**: Free plan $0/mo with 100 CU-hours/project/mo and 0.5 GB storage/project; Launch plan is pay-as-you-go at $0.106/CU-hour + $0.35/GB-month with **no monthly minimum**. Autosuspend after ~5 min of inactivity keeps idle cost at $0.
- **Native pgvector + HNSW**: the schema, the `<=>` cosine-distance retrieval query, and the tenant predicates carry over unchanged.
- **Built-in pooling**: PgBouncer is exposed through the `-pooler` hostname, solving at the platform level the exact problem RDS Proxy was selected to solve.
- **Database branching**: dev/test databases branch from `main` at no extra cost, removing shared-dev-cluster coordination.
- **Operational fit**: no VPC, no subnet management, no proxy. The CDK stack shrinks to functions, DynamoDB, S3, Cognito, and EventBridge.

## Alternatives Considered

- **Keep Aurora Serverless v2** — rejected: the ~$44/mo cluster floor plus RDS Proxy plus potential NAT (~$90–120/mo total), the VPC/proxy/rotation complexity, and the default-VPC subnet deploy bug.
- **RDS Proxy** — rejected: it only proxies RDS/Aurora instances in the same AWS account, so it is useless against Neon. It has no role in the new path.
- **VPC interface endpoints instead of NAT** — rejected: ~$7.2/mo per endpoint per AZ. The data plane calls four or more public services (S3, DynamoDB, Bedrock, SSM), so endpoints cost more than the problem they solve.
- **Other vector databases (OpenSearch / Pinecone / Weaviate)** — rejected: see ADR-004; the cost-floor and lock-in rejections there remain valid.

## Consequences

### Positive

- Infra cost ~$0 in dev and ~$10–30/mo in early prod.
- Deletes the VPC, security groups, secret rotation Lambda, RDS Data API IAM, and the Aurora-era custom resources from the stack.
- Removes the default-VPC `PRIVATE_WITH_EGRESS` subnet deploy bug.
- Simpler CDK stack: no RDS, no EC2/VPC constructs, no proxy, no rotation.

### Negative

- Autosuspend cold start: after ~5 min idle, the first query pays a compute wake-up latency.
- 0.5 GB storage cap on the Free plan; exceeding it requires the Launch plan.
- Data leaves the AWS account — vendor trust shifts to Neon. The Neon project is placed in us-east-1 for proximity to S3 and Bedrock.
- The Neon connection string is managed via SSM instead of IAM-native Secrets Manager rotation.

## Related Decisions

- **ADR-004**: this ADR supersedes its vector-storage (Aurora Serverless v2), connection-management (RDS Proxy), and credentials (Secrets Manager rotation) portions. Bedrock, in-Lambda parsers, and Lambda orchestration remain in force.
- **ADR-006** (Data Partitioning Strategy for Tenant Isolation): aligned unchanged — single Postgres project, single `public` schema, `chatbot_id` + `company_id` predicates on every query.

## Validation Needed

- Ingest smoke test against a real Neon dev project: apply the migration script (pgvector extension, `public.embeddings` table, HNSW index, unique index) and run one document end-to-end. floci cannot emulate Neon, so this validation requires a real Neon free project.
- Confirm the `@neondatabase/serverless` bundle works under the Lambda Node 24 runtime with the existing esbuild configuration.
- Benchmark the retrieval query on Neon and confirm the HNSW index is used for the multi-tenant filter.
