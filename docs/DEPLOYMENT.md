# chatSaaS — Deployment Guide

> **STALE (2026-09-05):** This guide documents the pre-ADR-008 Aurora data plane
> (Aurora Serverless v2, RDS Proxy, Secrets Manager rotation, VPC). ADR-008
> replaces Aurora with Neon (serverless Postgres + pgvector, non-VPC Lambdas,
> SSM SecureString). It must be re-scoped to the Neon path during WI-004
> implementation. Do not follow the Aurora/RDS Proxy sections.

A step-by-step guide to deploy chatSaaS to AWS. It covers prerequisites, every
environment variable, the CDK bootstrap/deploy, collecting stack outputs, Bedrock
model access, and post-deploy verification.

---

## 1. Architecture overview

chatSaaS is a pnpm monorepo with three deployable surfaces:

| Surface | Tech | Deployed by |
| --- | --- | --- |
| `infra/` | AWS CDK v2 (TypeScript) | `cdk deploy` |
| `apps/functions/` | Fastify 5 (Node 24) → Lambda container image | **Not yet wired into CDK** — see §8 |
| `apps/web/` | Next.js 16 / React 19 | **Not yet wired into CDK** — see §8 |

**What the CDK stack currently provisions** (single `ChatSaaSStack`):

- Aurora Serverless v2 cluster with `pgvector`
- RDS Proxy (skipped by default — see §6.3)
- Secrets Manager database secret + 7-day rotation hook
- Cognito User Pool + App Client + Domain (identity)
- S3 documents bucket
- DynamoDB tables: `companies` + `documents`
- Ingest Lambda + EventBridge rule + DLQ
- Custom resources: `public.embeddings` table, embeddings unique index

The RAG chat API (`apps/functions`) and the Next.js frontend (`apps/web`) are
sibling workspaces under active development (WI-006/WI-008); their production
hosting is **not yet part of this stack** and is documented honestly in §8.

---

## 2. Prerequisites

### 2.1 Local toolchain

| Tool | Version | Verify |
| --- | --- | --- |
| Node.js | `>=24.0.0` | `node -v` |
| pnpm | `>=11.0.0` (pin: `11.22.0`) | `pnpm -v` |
| AWS CDK CLI | `2.266.0`+ (installed via repo devDependency) | `pnpm -F @chatsaas/infra cdk --version` |

Install pnpm via corepack:

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
```

Install dependencies:

```bash
pnpm install
```

### 2.2 AWS account

- An AWS account with programmatic access (IAM user with `AdministratorAccess`
  or equivalent for bootstrapping, narrowed later).
- AWS CLI configured (`aws configure`), or the standard `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` environment variables exported.

### 2.3 AWS services to enable **manually**

These are NOT provisioned by CDK and must be enabled before the first request:

- **Amazon Bedrock model access** — enable both models in the target region:
  - `anthropic.claude-3-5-sonnet-*`
  - `amazon.titan-embed-text-v2:0`

  Path: AWS Console → Amazon Bedrock → Model access → request access. Approval
  is per-region and not instantaneous.

- **A default VPC** in the target region. The stack uses `Vpc.fromLookup` on the
  default VPC unless you pass VPC context (§6.1). If the default VPC was
  deleted, provide explicit VPC context.

---

## 3. Environment variables

Each workspace documents its variables in an `.env.example`. **Only `.env.example`
files are committed; real `.env` files are gitignored.**

### 3.1 Root (`/.env.example`) — reference only

The root `.env.example` is documentation; it does not power any script. It points
to the per-workspace files below.

### 3.2 Infrastructure (`infra/.env.example`)

Copy to `infra/.env` and fill in:

```bash
# AWS Account and Region
CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=us-east-1

# Stack Configuration
STACK_PREFIX=chatsaas
ENVIRONMENT=dev

# Cognito Configuration
COGNITO_ALLOW_SELF_SIGNUP=true
COGNITO_PASSWORD_POLICY_MIN_LENGTH=8

# Domain Configuration (optional)
# DOMAIN_NAME=app.chatsaas.com
# HOSTED_ZONE_ID=Z1234567890ABC
```

> `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` are read directly by
> `infra/app.ts` to set the stack `env`. `CDK_DEFAULT_REGION` also seeds the
> Cognito construct region (default `us-east-1`).

> The CDK stack does **not** read `STACK_PREFIX`, `ENVIRONMENT`,
> `COGNITO_*`, or `DOMAIN_*` from `infra/.env` today — those keys are
> forward-looking placeholders. Environment selection is driven by context
> (`-c envName=...`, §6). The real Cognito policy is compiled in
> `infra/lib/cognito-user-pool.ts` (password policy, self-signup, groups).

### 3.3 Functions API (`apps/functions/.env.example`)

These are set by the CDK stack for the ingest/rotation Lambdas at deploy time and
documented for reference. The RAG chat route (WI-006) additionally needs:

| Variable | Purpose |
| --- | --- |
| `CHATBOTS_TABLE_NAME`, `CONVERSATIONS_TABLE_NAME`, `MESSAGES_TABLE_NAME` | Chat persistence (WI-006) |
| `SUBSCRIPTIONS_TABLE_NAME`, `CREDITS_TABLE_NAME` | Metering / prepaid credits |
| `RDS_CLUSTER_ARN`, `RDS_SECRET_ARN`, `RDS_DATABASE` | Aurora pgvector via RDS Data API |
| `BEDROCK_EMBED_MODEL_ID` | `amazon.titan-embed-text-v2:0` |
| `CHAT_MODEL_ID` | `anthropic.claude-3-5-sonnet-*` |
| `CHAT_TOP_K`, `CHAT_MAX_TOKENS`, `CHAT_TEMPERATURE`, `CHAT_CONTEXT_TURNS` | Completion params (sensible defaults exist) |
| `CHAT_SYSTEM_PROMPT_DEFAULT`, `CHAT_FALLBACK_ANSWER` | RAG prompt defaults |
| `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | JWT verification |

The Fastify server degrades gracefully: routes whose env vars are missing are not
mounted (a warning is logged at boot). See `apps/functions/README.md` for the
full table and the Warm-Up runbook.

### 3.4 Web frontend (`apps/web/.env.local.example`)

Copy to `apps/web/.env.local` for local dev. For production these are build/runtime
environment variables (all `NEXT_PUBLIC_*` are inlined at build time):

```bash
# AWS
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012

# Cognito — obtained from CDK stack outputs (§7)
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_COGNITO_DOMAIN=chatsaas-dev.auth.us-east-1.amazoncognito.com
# Optional — only for a confidential app client (secret enabled)
COGNITO_CLIENT_SECRET=

# API
NEXT_PUBLIC_API_URL=https://<api-host>/api

# Environment
NODE_ENV=production
```

The issuer and JWKS URL are derived from `NEXT_PUBLIC_COGNITO_REGION` and
`NEXT_PUBLIC_COGNITO_USER_POOL_ID`; `NEXT_PUBLIC_COGNITO_ISSUER_URL` can override
the derivation if needed (see `apps/web/src/lib/jwt.ts`).

---

## 4. Local sanity check (optional, before AWS)

```bash
# Typecheck + unit tests across the monorepo
pnpm type-check
pnpm test

# Synthesize the CDK template without AWS access (uses cdk.context.json)
pnpm -F @chatsaas/infra synth
```

The repo ships `infra/cdk.context.json` with mock VPC values and `skipProxy: true`
precisely so `cdk synth` and `vitest` run without AWS credentials.

---

## 5. CDK bootstrap (once per account/region)

```bash
pnpm -F @chatsaas/infra cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

Example:

```bash
pnpm -F @chatsaas/infra cdk bootstrap aws://123456789012/us-east-1
```

This creates the CDK toolkit stack (S3 staging bucket + IAM roles) the deploy
depends on.

---

## 6. Deploy the stack

### 6.1 VPC selection

The stack resolves its VPC two ways (`infra/lib/vpc.ts`):

1. **Default** (no context): `Vpc.fromLookup` on the account's **default VPC**.
   Requires AWS credentials + an existing default VPC.
2. **Explicit** via context (flat keys):

   ```bash
   -c vpcId=vpc-0abc123 -c privateSubnetIds=subnet-1,subnet-2 \
   -c availabilityZones=us-east-1a,us-east-1b
   ```

### 6.2 Environment (`envName`)

`envName` defaults to `dev` and is passed to every construct (resource naming,
RemovalPolicy, deletion protection). Set it per environment:

```bash
-c envName=dev     # destroy-on-delete, no deletion protection
-c envName=prod    # RETAIN, PITR, deletion protection
```

> For `prod`, `CognitoUserPoolConstruct` **throws** unless `adminAllowlist` is
> non-empty (`infra/lib/cognito-user-pool.ts`). The allowlist is currently
> hard-coded in `chat-saas-stack.ts` as `[]` — a prod deploy today requires
> wiring a real allowlist first. Treat the stack as **dev-safe**; production
> identity is not yet fully configured (see §8).

### 6.3 RDS Proxy (`skipProxy`)

RDS Proxy is skipped by default because of a CDK 2.266.0 limitation
(`ServerlessCluster.engine` is not exposed, so `ProxyTarget.bind` throws at
synth). The MVP uses direct RDS Data API for Lambdas.

```bash
-c skipProxy=true   # default via cdk.context.json — proxy omitted
```

Do not set `skipProxy=false` on the current CDK version; it will fail at synth.

### 6.4 Review + deploy

```bash
# Preview the changes (does not deploy)
pnpm -F @chatsaas/infra cdk diff -c envName=dev

# Deploy
pnpm -F @chatsaas/infra cdk deploy -c envName=dev
```

The deploy is long (Aurora Serverless v2 + custom resources can take 20–40
minutes on first run).

---

## 7. Collect the stack outputs

After deploy, capture the outputs and feed them into the web/functions env:

```bash
pnpm -F @chatsaas/infra cdk list --show-values  # or `cdk deploy --outputs-file out.json`
```

| Output | Feeds into |
| --- | --- |
| `UserPoolId` | `NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `COGNITO_USER_POOL_ID` |
| `UserPoolClientId` | `NEXT_PUBLIC_COGNITO_CLIENT_ID`, `COGNITO_CLIENT_ID` |
| `UserPoolDomain` | `NEXT_PUBLIC_COGNITO_DOMAIN` |
| `IssuerUrl` | `NEXT_PUBLIC_COGNITO_ISSUER_URL` (optional override) |
| `ClusterEndpoint` / `ClusterArn` | `RDS_CLUSTER_ARN` (functions) |
| `SecretArn` | `RDS_SECRET_ARN` (functions) |
| `DatabaseName` | `RDS_DATABASE` (functions) |
| `DocumentsBucketName` | ingest env |
| `DocumentsTableName` | ingest / functions `DOCUMENTS_TABLE_NAME` |
| `IngestLambdaName`, `IngestDlqUrl` | ops / runbook |
| `ProxyEndpoint`, `ProxyArn` | present only when proxy is **not** skipped |

---

## 8. What is NOT yet deployable (known gaps)

Be honest with yourself before treating this as "the app is fully deployed":

1. **API service (`apps/functions`)** — the Fastify RAG API is not in the CDK
   stack. It ships as a Lambda container image per its README, but there is no
   `DockerImageFunction`/API Gateway construct for it yet, and no
   `CHATBOTS_TABLE_NAME`/`CONVERSATIONS_TABLE_NAME`/etc. tables are created by CDK.
   Deploying it is future work (WI-006).

2. **Frontend hosting (`apps/web`)** — Next.js is not wired to CDK (no Amplify/
   CloudFront/S3 static site construct). It builds with `pnpm build` and runs with
   `pnpm start`, but production hosting is not yet in IaC.

3. **Production identity** — Cognito `callbackUrls.prod`, `signOutUrls.prod`, and
   `adminAllowlist` are empty/`[]` in the stack. A real prod OAuth flow needs those
   wired.

4. **Custom domain** — `DOMAIN_NAME` / `HOSTED_ZONE_ID` exist as placeholders in
   `infra/.env.example` but no Route53/ACM/CloudFront code consumes them yet.

**Net result today**: `cdk deploy` stands up the *data plane + identity* (Aurora,
pgvector, secrets, Cognito, ingest pipeline). The *application plane* (API + web)
is still developed locally / in sandbox and is not production-deployable from this
repo without further work.

---

## 9. Post-deploy verification

### 9.1 Verify infrastructure

```bash
# Stack resources are healthy
pnpm -F @chatsaas/infra cdk describe-stacks 2>/dev/null || \
  aws cloudformation describe-stacks --stack-name ChatSaaSStack
```

### 9.2 Verify the ingest pipeline

1. Upload a small document to the `DocumentsBucketName` bucket.
2. Watch the `IngestLambdaName` CloudWatch logs for a successful embed + pgvector
   write.
3. On failure, inspect the `IngestDlqUrl` queue.

### 9.3 Verify Bedrock access

From the functions sandbox or a minimal Lambda invocation, issue one `InvokeModel`
call against each model. A `AccessDeniedException` means model access is still
pending for that region.

### 9.4 Warm-up

The API container (once deployed) is intentionally **not** provisioned-concurrency
warmed. After a deploy, issue one minimal request against a published chatbot
endpoint and discard the result (see `apps/functions/README.md` runbook). A cold
start + Bedrock first-token latency can breach the p95 budget on the first request.

---

## 10. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `cdk synth` fails with VPC lookup error | No default VPC or no AWS creds — pass explicit `-c vpcId=... -c privateSubnetIds=... -c availabilityZones=...` |
| `CouldNotDetermineEngineForProxyTarget` at synth | Proxy enabled on CDK 2.266.0 — keep `skipProxy=true` |
| `CognitoUserPoolConstruct: adminAllowlist is required for prod` | Deploying with `-c envName=prod` — wire a real allowlist first |
| Bedrock `AccessDeniedException` | Model access not granted in region — §2.3 |
| `ThrottlingException` under load | Bedrock `InvokeModel` quota (~25–50 req/s default) — request a quota increase in Service Quotas |
| Route not mounted at API boot | Missing env var — check `apps/functions/README.md` table |
| `credentials` not found during deploy | `aws configure` or export `AWS_*` env vars |