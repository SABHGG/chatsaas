# chatSaaS — Deployment Guide

> **Current (2026-09-08):** rewritten for the ADR-008 Neon data plane. The
> Aurora Serverless v2 / RDS Proxy / Secrets Manager / VPC content of the
> pre-2026-09-05 guide was removed — that path no longer exists in the code.

A step-by-step guide to deploy chatSaaS to AWS. It covers prerequisites, the
Neon project setup, every environment variable, the CDK bootstrap/deploy,
collecting stack outputs, and post-deploy verification. A separate section (§9)
documents the local sandbox (floci) used for development.

---

## 1. Architecture overview

chatSaaS is a pnpm monorepo with three deployable surfaces:

| Surface | Tech | Deployed by |
| --- | --- | --- |
| `infra/` | AWS CDK v2 (TypeScript) | `cdk deploy` |
| `apps/functions/` | Fastify 5 (Node 24) | Ingest Lambda is in CDK; **the public chat API is not yet** — see §8 |
| `apps/web/` | Next.js 16 / React 19 | **Not yet wired into CDK** — see §8 |

**What the CDK stack (`ChatSaaSStack`) provisions today:**

| Concern | Resource |
| --- | --- |
| Vector store | **External Neon project** (serverless Postgres + pgvector, us-east-1) — schema applied by `infra/db/migrations/`, NOT by CDK |
| Connection | `@neondatabase/serverless` HTTP driver, pooled endpoint, URL read at runtime from SSM SecureString `chatsaas-{env}-neon-url` |
| Identity | Cognito User Pool + App Client + Domain (WI-008) |
| Documents | S3 bucket + DynamoDB `documents` table (WI-005) |
| Ingest | Lambda (no VPC) + EventBridge rule on `s3:ObjectCreated:Put` + SQS DLQ |
| Companies | DynamoDB `companies` table (WI-008) |

There is **no Aurora, no RDS Proxy, no Secrets Manager, no VPC** in the stack:
Lambdas run outside any VPC and reach Neon / AWS services over TLS.

Stack outputs: `NeonUrlParameterName`, `EmbeddingsTableName`,
`DocumentsBucketName`, `DocumentsTableName`, `IngestLambdaName`,
`IngestDlqUrl`, plus the Cognito outputs (`UserPoolId`, `UserPoolClientId`,
`UserPoolDomain`, `IssuerUrl`).

---

## 2. Prerequisites

### 2.1 Local toolchain

| Tool | Version | Verify |
| --- | --- | --- |
| Node.js | `>=24.0.0` | `node -v` |
| pnpm | `>=11.0.0` (pin: `11.22.0`) | `pnpm -v` |
| AWS CDK CLI | via repo devDependency | `pnpm -F @chatsaas/infra cdk --version` |

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install
```

### 2.2 AWS account

- Programmatic access (IAM user or role) with permissions to deploy CloudFormation,
  Cognito, S3, DynamoDB, Lambda, EventBridge, SQS, SSM.
- Credentials configured (`aws configure` or `AWS_*` env vars).
- **No default VPC requirement** — the stack does not create or look up VPCs.

### 2.3 Neon project (manual, external)

The database is external to AWS (ADR-008). Per environment:

1. Create a Neon project in `us-east-1` (free plan is fine for dev).
2. Copy the **pooled** connection string (hostname contains `-pooler`).
3. Apply the embeddings schema once per branch (§5).
4. Store the URL in SSM (§6).

Free-plan caveats: autosuspend after ~5 min idle (first query pays a wake-up);
0.5 GB storage cap on the dev project.

### 2.4 AWS services to enable manually

- **Amazon Bedrock model access** (Console → Bedrock → Model access):
  - `amazon.titan-embed-text-v2:0` (ingest + query embeddings)
  - `anthropic.claude-3-5-sonnet-*` (chat completions)

  Approval is per-region and not instantaneous.

---

## 3. Environment variables

Only `.env.example` files are committed; real `.env` files are gitignored.

### 3.1 Infra (`infra/.env` — optional)

`CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION` drive the stack env. Resource
naming and policies come from CDK context (`-c envName=...`, §6).

### 3.2 Functions (`apps/functions/.env.example`)

What the CDK stack sets on the **ingest Lambda** at deploy time:

| Variable | Value |
| --- | --- |
| `DOCUMENTS_BUCKET`, `DOCUMENTS_TABLE` | wired by `IngestLambdaConstruct` |
| `NEON_URL_PARAMETER_NAME` | `chatsaas-{env}-neon-url` |
| `BEDROCK_EMBED_MODEL_ID`, `BEDROCK_REGION` | pinned in the construct |

What the **API/chat surface** needs (set by the deploy once WI-011 lands; for
the sandbox server they live in `.env`):

| Variable | Purpose |
| --- | --- |
| `CHATBOTS_TABLE_NAME`, `CONVERSATIONS_TABLE_NAME`, `MESSAGES_TABLE_NAME` | chat persistence |
| `SUBSCRIPTIONS_TABLE_NAME`, `CREDITS_TABLE_NAME` | metering gates (`wi006-*`) |
| `NEON_URL_PARAMETER_NAME` | SSM parameter holding the Neon pooled URL |
| `NEON_DATABASE_URL` | direct override (sandbox only; production resolves via SSM) |
| `BEDROCK_EMBED_MODEL_ID`, `CHAT_MODEL_ID` | `amazon.titan-embed-text-v2:0`, `anthropic.claude-3-5-sonnet-*` |
| `PUBLIC_CHAT_BASE_URL` | base URL stamped into the published `iframe_src` (default `https://chat.chatsaas.local`) |
| `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | JWT verification on authenticated routes |
| `CHAT_TOP_K`, `CHAT_MAX_TOKENS`, `CHAT_TEMPERATURE`, `CHAT_CONTEXT_TURNS` | completion params (defaults exist) |
| `CHAT_SYSTEM_PROMPT_DEFAULT`, `CHAT_FALLBACK_ANSWER` | RAG prompt defaults |

The server degrades gracefully: routes whose env vars are missing are not
mounted (a warning is logged at boot).

> **Never** `source` the real `.env` in shell — the Neon URL contains `&`.
> Scripts read it via `node --env-file-if-exists=.env` or the loaders do.

### 3.3 Web (`apps/web/.env.local.example`)

```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_COGNITO_DOMAIN=<pool>.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_API_URL=https://<api-host>/api
NODE_ENV=production
```

Issuer/JWKS are derived from region + pool id. The OAuth redirect URI is
derived from the request origin (`${origin}/api/auth/callback`), so the app
must be reached at the same origin it is registered under.

---

## 4. Apply the Neon schema (once per environment/branch)

`cdk deploy` does NOT create the embeddings schema — a migration script does:

```bash
# Prereq: NEON_DATABASE_URL in apps/functions/.env (pooled endpoint)
pnpm --filter @chatsaas/functions exec node --env-file-if-exists=.env \
  scripts/run-neon-migration.mjs
```

Executes `infra/db/migrations/001-embeddings-pgvector.sql` via the Neon HTTP
driver and verifies: `vector` extension, `public.embeddings` table, the
`chatbot+company` btree index, the unique `(chatbot_id, content_sha256)` index
(content-level dedupe), and the HNSW cosine index. All statements are
idempotent. New migrations: `infra/db/migrations/NNN-<slug>.sql`.

## 5. Store the Neon URL in SSM (pending manual)

The Lambdas fetch the URL at runtime with `ssm:GetParameter`. Create the
SecureString once per environment:

```bash
aws ssm put-parameter \
  --name "chatsaas-dev-neon-url" \
  --type "SecureString" \
  --value "postgresql://<user>:<password>@<pooler-endpoint>/neondb?sslmode=require&channel_binding=require" \
  --region us-east-1
```

- Always the **pooled** endpoint. AWS-managed key (`aws/ssm`) needs no extra
  KMS grant; the Lambda role is granted `ssm:GetParameter` on that parameter
  only.
- Rotation: change the Neon role password, then `put-parameter --overwrite`.
- **Status: not yet created** against a real AWS account (WI-004 pending
  manual). Required before any deployed Lambda can reach Neon.

---

## 6. Deploy the stack

```bash
# One-time per account/region
pnpm -F @chatsaas/infra cdk bootstrap aws://<ACCOUNT_ID>/<REGION>

# Preview + deploy
pnpm -F @chatsaas/infra cdk diff   -c envName=dev
pnpm -F @chatsaas/infra cdk deploy -c envName=dev
```

- `-c envName=dev` — destroy-on-delete resources.
- `-c envName=prod` — RETAIN / deletion protection; the Cognito construct
  **throws** unless an admin allowlist is wired. Today `adminAllowlist` is
  hard-coded `[]` in `chat-saas-stack.ts`: treat the stack as **dev-safe**
  until that is parameterized.

The deploy is quick compared to the Aurora era (no cluster, no custom
resources for the DB schema) — Cognito + S3 + DDB + Lambda, minutes not hours.

### 7. Collect stack outputs

```bash
pnpm -F @chatsaas/infra cdk deploy --outputs-file out.json -c envName=dev
```

| Output | Feeds into |
| --- | --- |
| `UserPoolId` | `NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `COGNITO_USER_POOL_ID` |
| `UserPoolClientId` | `NEXT_PUBLIC_COGNITO_CLIENT_ID`, `COGNITO_CLIENT_ID` |
| `UserPoolDomain` | `NEXT_PUBLIC_COGNITO_DOMAIN` |
| `IssuerUrl` | `NEXT_PUBLIC_COGNITO_ISSUER_URL` (optional override) |
| `NeonUrlParameterName` | `NEON_URL_PARAMETER_NAME` (functions) |
| `EmbeddingsTableName` | reference only (`public.embeddings`) |
| `DocumentsBucketName` | ingest env / runbook |
| `DocumentsTableName` | `DOCUMENTS_TABLE` (ingest), functions docs routes |
| `IngestLambdaName`, `IngestDlqUrl` | ops / runbook |

---

## 8. What is NOT yet deployable (known gaps)

Be honest before calling the app "deployed":

1. **Public chat API** — the routes
   `/api/public/chat/:id/message`, `/api/public/chatbots/:id/config|iframe`,
   and the metered chat pipeline (`chatPublicMessage`) exist only in the local
   sandbox server. No CDK construct deploys them: tracked as draft
   **WI-011** (`knowledge/delivery/work-items/draft/WI-011-public-chat-infra.md`).
2. **Frontend hosting** — Next.js is not wired to CDK (no Amplify/CloudFront
   construct). `pnpm build` / `pnpm start` work; hosting is not in IaC.
3. **Production identity** — Cognito `callbackUrls.prod`, `signOutUrls.prod`,
   and `adminAllowlist` are empty in the stack.
4. **Metering tables** — `wi006-subscriptions` / `wi006-credits` gate the chat
   (`checkLimits` reads `id = companyId`) and are created outside CDK today
   (open question Q-WI011-2).
5. **Custom domain** — `DOMAIN_NAME`/`HOSTED_ZONE_ID` remain placeholders; the
   published `iframe_src` stamps `PUBLIC_CHAT_BASE_URL`.

**Net result**: `cdk deploy` stands up the **data plane + identity** (Neon
connection config, Cognito, documents store, ingest pipeline). The
application plane (public chat API + web) is sandbox-only until WI-011.

---

## 9. Local sandbox (development, no AWS)

The dev loop runs fully local against emulated AWS + real Neon:

| Service | What | Start |
| --- | --- | --- |
| floci | AWS emulator (Docker): DynamoDB, S3, Cognito stubs | `floci up` (desktop app required) |
| Sandbox API :3001 | full Fastify API on floci data | `pnpm -F @chatsaas/functions dev:api` |
| Sandbox web :3000 | Next dev (BFF on `/api/*`) | `pnpm dev:sandbox` |
| Fake Cognito IdP :4568 | HTTPS OAuth2 IdP fixture (auth-code + PKCE) | `pnpm exec tsx apps/web/e2e/fixtures/fake-cognito.mts` |
| Mock Bedrock :4567 | deterministic Titan/Claude responses | `pnpm exec tsx scripts/mock-bedrock.ts` |
| Ingest bot | runs the REAL ingest handler for every `uploaded` doc | `pnpm exec tsx --env-file-if-exists=.env scripts/sandbox-ingest-bot.mjs [chatbotId]` |
| Plans seed | idempotent plan-1/plan-2 seeding (wizard review) | `node scripts/sandbox-seed-plans.mjs` |

Gotchas learned the hard way (all verified):

- **Browser must ride `localhost`**, never `127.0.0.1`: Next 16 dev
  canonicalizes the origin to `http://localhost:3000`, and the `oauth_state`
  cookie is host-bound. A `127.0.0.1` session strands the cookie →
  callback fails with `?error=state_mismatch`.
- **TLS**: the fake IdP is HTTPS with a self-signed cert. The web process needs
  `NODE_EXTRA_CA_CERTS=/tmp/opencode/sandbox/fake-cognito-cert.pem` (BFF token
  exchange + middleware JWKS fetch). Never use
  `NODE_TLS_REJECT_UNAUTHORIZED=0`. curl needs `-k` on IdP hops.
- One-time browser acceptance of the self-signed cert: "Avanzado → Continuar".
- Embed pages: publish stamps `PUBLIC_CHAT_BASE_URL` — point it to
  `http://localhost:3000/chat` for local iframe testing
  (`apps/web/public/embed-test.html` is the harness).
- floci cannot emulate Neon: ingest embeddings go to the **real** Neon dev
  project (driver resolves `NEON_DATABASE_URL` directly in the sandbox).
- Documents uploaded through the sandbox API stay `uploaded` forever (no
  EventBridge in floci) — the ingest bot above is the trigger.

---

## 10. Post-deploy verification

1. **Schema**: run the migration (§4) → printed verification lists the 3 indexes.
2. **SSM**: the parameter exists and the value uses the pooled endpoint.
3. **Ingest**: upload a document to `DocumentsBucketName` → the
   `IngestLambdaName` logs show `ingest:document:ready` with
   `inserted_count > 0`; failures land in `IngestDlqUrl`.
4. **Dedupe**: re-upload the same file → same `chunk_count`, `inserted_count 0`
   (unique `content_sha256`).
5. **Bedrock**: one `InvokeModel` per model; `AccessDeniedException` means
   model access is still pending (§2.4).
6. **Identity**: Cognito hosted UI renders; a login round-trip reaches
   `${origin}/api/auth/callback` without `?error=...`.
7. **Warm-up**: first request after deploy pays Neon autosuspend + Lambda cold
   start; issue a throwaway request against a published chatbot first.

---

## 11. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Callback `?error=state_mismatch` | Origin mismatch: access the app at the same host the BFF canonicalizes (`localhost`), or re-register Cognito callback URLs |
| `RetrievalError db_error` on chat | Neon URL not resolvable: check `NEON_URL_PARAMETER_NAME` env and the SSM parameter value |
| First query very slow | Neon autosuspend wake-up (free plan) — §2.3 |
| Ingest `Unknown compression method in flate stream` | Fixed (2026-09-08): PDFs parse via `unpdf`; if you see it, an old build is deployed |
| Ingest rows land with `inserted_count: 0` | Dedupe: identical `(chatbot_id, content_sha256)` already present — expected |
| Bedrock `AccessDeniedException` | Model access not granted in region (§2.4) |
| Bedrock `ThrottlingException` | ~25–50 req/s default quota — request an increase |
| Route not mounted at API boot | Missing env var; the server logs the warning at boot |
| Prod Cognito deploy throws | `adminAllowlist` is `[]` — wire a real allowlist first |
| floci tables missing | Run the sandbox setup/seed scripts (§9) before starting the API |
