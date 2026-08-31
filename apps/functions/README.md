# apps/functions — Lambda Functions

Fastify 5.12.1 + Node 24 service that hosts the chatSaaS REST API (admin + public surfaces) and runs inside a Lambda container image.

## Environment variables

The server degrades gracefully: surfaces whose required env vars are missing are not mounted (a warning is logged at boot).

| Variable | Used by | Description |
|---|---|---|
| `CHATBOTS_TABLE_NAME` | WI-006 chat route | DynamoDB table holding chatbot rows |
| `CONVERSATIONS_TABLE_NAME` | WI-006 chat route | Conversations (upserted per turn) |
| `MESSAGES_TABLE_NAME` | WI-006 chat route | Message rows (user + assistant, exact token counts) |
| `SUBSCRIPTIONS_TABLE_NAME` | WI-006 chat route | Subscription rows; `monthlyUsed` is incremented atomically after each completed conversation |
| `CREDITS_TABLE_NAME` | WI-006 chat route | Prepaid credit balance (`creditsOptedIn`, `balance`) |
| `RDS_CLUSTER_ARN` / `RDS_SECRET_ARN` / `RDS_DATABASE` | WI-006 `retrieveChunks` | Aurora pgvector via RDS Data API (same `DB_CONNECTION_MODE` decision as WI-005) |
| `BEDROCK_EMBED_MODEL_ID` | WI-006 `embedQuestion` | Titan v2 (`amazon.titan-embed-text-v2:0`, 1024 dims) — same model as WI-005 ingest |
| `CHAT_MODEL_ID` | WI-006 `completeBedrock` | Claude 3.5 Sonnet (`anthropic.claude-3-5-sonnet-20240620-v1:0`) |
| `CHAT_TOP_K` (default 10) | WI-006 | Retrieved chunks per query |
| `CHAT_MAX_TOKENS` / `CHAT_TEMPERATURE` | WI-006 | Completion parameters |
| `CHAT_CONTEXT_TURNS` (default 4) | WI-006 | Rolling conversation context rebuilt server-side |
| `CHAT_SYSTEM_PROMPT_DEFAULT` | WI-006 | System prompt fallback when the chatbot row has no `settings.system_prompt` |
| `CHAT_FALLBACK_ANSWER` | WI-006 | Answer returned when retrieval yields zero rows (AC 9) |

## Public chat route (WI-006)

`POST /api/public/chat/:chatbotId/message` — anonymous; the chatbot row is the
single trusted tenant-scope source. Pipeline (strictly ordered):

1. `resolveChatbotScope` — one DynamoDB read of the chatbot row; must be `published`
2. `checkLimits` — ADR-005 matrix (no subscription → 402, 100% → hard 402, 80% → `x-credit-alert` header)
3. `debitConversation` — atomic `UpdateItem` + `ConditionExpression: balance >= :cost` (no Bedrock call on failure)
4. `embedQuestion` — Titan v2 with bounded jittered backoff (R-3)
5. conversation ownership check + `loadHistory` — client `conversation_id` honored only when it belongs to the same chatbot + company
6. `retrieveChunks` — pgvector `<=>` filtered on `chatbot_id` AND `company_id` (R-1)
7. `buildPrompt` — delimited chunks (800-char cap, top-K 10), system-prompt priority (R-4)
8. `completeBedrock` — Claude 3.5 Sonnet; exact `usage` tokens parsed, never estimated (R-8)
9. `persistTurn` + monthly counter increment + prepaid refund on downstream failure (JD-B-003)

See `openspec/WI-006-retrieval-chat-openapi.yaml` and `knowledge/tech/api-spec.md` for the full contract.

## Latency budget

- Target: **p50 < 3 s, p95 < 8 s** end-to-end (embed + retrieve + complete + persist).
- Streaming (SSE) is explicitly out of scope for WI-006.

## Cold start and warm-up

Provisioned concurrency is intentionally **out** (cost). A Lambda cold start plus the
Bedrock first-token latency can breach the p95 budget on the first request after a deploy.

Runbook — warm-up ping after every deploy:

1. After the Lambda alias is shifted, issue a minimal request against the published
   chatbot endpoint (a 1-token message is enough) and discard the result.
2. Repeat once per container if the function uses more than one reserved concurrency slot.
3. The warm-up request may return 200 or 4xx; what matters is that the container is
   initialized (Fastify boot, SDK clients, first TLS handshake).

## Bedrock model access and quotas

- Enable model access for `anthropic.claude-3-5-sonnet-*` **and**
  `amazon.titan-embed-text-v2:0` in the target region (us-east-1 baseline) before deploying.
- Account default `InvokeModel` throughput is roughly 25–50 req/s; a hot published
  chatbot can saturate it (R-3). The handler already retries `ThrottlingException`
  with bounded jittered backoff (5 attempts, base 200 ms, cap 5 s) and fails fast on
  `ValidationException` / `AccessDeniedException`.
- Quota increase path: AWS Console → Service Quotas → Amazon Bedrock →
  `InvokeModel` throughput for the specific model → request increase. Start the request
  before an expected traffic peak; approvals are not instantaneous.

## Development

```bash
pnpm -F functions test        # vitest
pnpm -F functions type-check  # tsc --noEmit
```

## Local sandbox API (`pnpm dev:api`)

Runs the same Fastify server as production, but with Cognito JWT verification
replaced by a stub (the real JWKS is unreachable locally) and resource names
pointed at the local floci emulator tables/bucket.

1. Create `apps/functions/.env` (gitignored). Quickest way to seed AWS
   credentials and resource names from the emulator — the `export KEY=value`
   lines `floci env` prints are accepted as-is by Node's `--env-file` parser:

   ```bash
   cd apps/functions
   floci env > .env
   ```

2. Append the sandbox-specific variables (sensible defaults shown):

   ```
   PORT=3001
   SANDBOX_USER_SUB=sandbox-user-1
   SANDBOX_COMPANY_ID=sandbox-company-1
   DOCUMENTS_BUCKET=chatsaas-sandbox-documents
   DOCUMENTS_TABLE=chatsaas-sandbox-documents
   ```

3. Run the API with watch mode from the repo root:

   ```bash
   pnpm dev:api
   ```

   (equivalent to `pnpm -F @chatsaas/functions dev:sandbox`)

No more pasting `eval $(floci env)` into the terminal: the `.env` file is
loaded automatically, and the server starts without it (routes whose env vars
are missing simply are not mounted).
