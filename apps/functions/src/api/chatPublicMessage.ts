import Fastify, { type FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { z } from 'zod'
import { resolveChatbotScope } from '../retrieval/resolveChatbotScope.js'
import { checkLimits, loadLimitSnapshot, CREDIT_ALERT_HEADER, CREDIT_ALERT_VALUE } from '../retrieval/checkLimits.js'
import { neonQueryFn, type NeonQueryFn } from '../ingest/persistEmbeddings.js'
import { resolveNeonUrl } from '../ingest/neonUrl.js'
import { debitConversation } from '../retrieval/debitConversation.js'
import { embedQuestion } from '../retrieval/embedQuestion.js'
import { retrieveChunks } from '../retrieval/retrieveChunks.js'
import { buildPrompt, loadHistory, DEFAULT_CONTEXT_TURNS } from '../retrieval/buildPrompt.js'
import { completeBedrock } from '../retrieval/completeBedrock.js'
import { persistTurn, hashVisitorId } from '../retrieval/persistTurn.js'
import { RetrievalError } from '../retrieval/types.js'

/**
 * WI-006 public chat handler: POST /api/public/chat/:chatbotId/message
 *
 * Anonymous (no JWT preHook — the chatbot row is the trusted tenant-scope
 * source, R-1). Pipeline is strictly sequential:
 *   resolve scope → check limits → debit credits → embed → retrieve →
 *   build prompt → complete → persist → respond.
 *
 * Error mapping per knowledge/tech/api-spec.md:
 *   400 validation, 402 limits/credits, 404 not found / not published,
 *   500 Bedrock/DB failure. Errors follow the spec shape
 *   { error, details, path, timestamp }.
 */

// Strict shape: no passthrough, no client-injected history/tenant fields.
const chatBodySchema = z
  .object({
    message: z.string().min(1).max(2000),
    conversation_id: z.string().uuid().optional(),
  })
  .strict()
type ChatBody = z.infer<typeof chatBodySchema>

// zod 4.5.4 AOT compile: this is the FINAL body schema (nothing derives from
// it), compiled once at module load — not per request — to keep Lambda
// cold-start cost bounded. Inference stays on the original schema; the
// compiled clone is only used at the parse site below. Invalid bodies fall
// back to the runtime parser with identical ZodError reporting, so the 400
// contract is unchanged.
const CompiledChatBody = z.compile(chatBodySchema)

const CREDIT_COST_PER_CONVERSATION = 1

export interface ChatRouteEnv {
  chatbotsTable: string
  conversationsTable: string
  messagesTable: string
  subscriptionsTable: string
  creditsTable: string
  /** SSM SecureString name holding the Neon pooled URL (ADR-008). */
  neonParameterName: string
  bedrockRegion: string
  embedModelId: string
  chatModelId: string
  topK: number
  maxTokens: number
  temperature: number
  contextTurns: number
  fallbackAnswer: string
}

export function chatRouteEnvFromProcess(): ChatRouteEnv | null {
  const required = [
    'CHATBOTS_TABLE_NAME',
    'CONVERSATIONS_TABLE_NAME',
    'MESSAGES_TABLE_NAME',
    'SUBSCRIPTIONS_TABLE_NAME',
    'CREDITS_TABLE_NAME',
    'NEON_URL_PARAMETER_NAME',
    'BEDROCK_EMBED_MODEL_ID',
    'CHAT_MODEL_ID',
  ] as const
  const missing = required.filter((k) => !process.env[k])
  if (missing.length > 0) return null
  return {
    chatbotsTable: process.env.CHATBOTS_TABLE_NAME!,
    conversationsTable: process.env.CONVERSATIONS_TABLE_NAME!,
    messagesTable: process.env.MESSAGES_TABLE_NAME!,
    subscriptionsTable: process.env.SUBSCRIPTIONS_TABLE_NAME!,
    creditsTable: process.env.CREDITS_TABLE_NAME!,
    neonParameterName: process.env.NEON_URL_PARAMETER_NAME!,
    bedrockRegion: process.env.AWS_REGION ?? 'us-east-1',
    embedModelId: process.env.BEDROCK_EMBED_MODEL_ID!,
    chatModelId: process.env.CHAT_MODEL_ID!,
    topK: Number(process.env.CHAT_TOP_K ?? 10),
    maxTokens: Number(process.env.CHAT_MAX_TOKENS ?? 1024),
    temperature: Number(process.env.CHAT_TEMPERATURE ?? 0.2),
    contextTurns: Number(process.env.CHAT_CONTEXT_TURNS ?? DEFAULT_CONTEXT_TURNS),
    fallbackAnswer:
      process.env.CHAT_FALLBACK_ANSWER ??
      "I'm sorry — I don't have information about that in my knowledge base yet.",
  }
}

interface RetrievalErrorLike {
  code?: string
  name?: string
}

/** api-spec.md error mapping for the public chat surface. */
function statusCodeFor(err: RetrievalErrorLike): number {
  switch (err.code ?? err.name) {
    case 'chatbot_not_found':
    case 'chatbot_not_published':
      // 404 (NOT 403) for draft/archived: don't leak existence (AC 3).
      return 404
    case 'monthly_limit_exhausted':
    case 'prepaid_credits_exhausted':
    case 'no_active_subscription':
      return 402
    default:
      return 500
  }
}

function errorPayload(err: Error, path: string, details?: unknown) {
  return {
    error: err.message,
    details,
    path,
    timestamp: new Date().toISOString(),
  }
}

function logStructured(level: 'info' | 'error', message: string, ctx: Record<string, unknown>) {
  const line = { level, message, ts: new Date().toISOString(), ...ctx }
  if (level === 'error') console.error(JSON.stringify(line))
  else console.log(JSON.stringify(line))
}

const chatPublicMessagePlugin: FastifyPluginAsync<{
  env: ChatRouteEnv
  deps?: ChatPublicMessageDeps
}> = async (
  fastify,
  opts,
) => {
  const env = opts.env
  const deps = opts.deps ?? {}
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  })

  fastify.post(
    '/:chatbotId/message',
        { // Body validated with Zod (strict); no JSON Schema here on purpose.
        },
    async (request, reply) => {
      const started = Date.now()
      const path = request.url
      const chatbotId = (request.params as { chatbotId: string }).chatbotId
      const requestId = request.id

      // Zod validation (strict) — extra fields like company_id/history are
      // rejected with 400 before anything else runs.
      let body: ChatBody
      try {
        body = CompiledChatBody.parse(request.body)
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply
            .code(400)
            .send(errorPayload(new Error('Validation failed'), path, err.issues))
        }
        throw err
      }

      try {
        // 1. Resolve scope from the chatbot row (R-1).
        const scope = await resolveChatbotScope(ddb, {
          chatbotsTable: env.chatbotsTable,
          chatbotId,
        })

        // 2. Limits: allow / 402 / credit path (ADR-005 matrix).
        const snapshot = await loadLimitSnapshot(ddb, env, scope.companyId)
        const limitResult = checkLimits({ snapshot, companyId: scope.companyId })
        if (limitResult.alert80) {
          reply.header(CREDIT_ALERT_HEADER, CREDIT_ALERT_VALUE)
        }

        // 3. Debit prepaid credits BEFORE any Bedrock call (R-2: atomic
        //    ConditionExpression; failure → 402, no model invocation).
        if (snapshot.creditsOptedIn) {
          await debitConversation(ddb, {
            creditsTable: env.creditsTable,
            companyId: scope.companyId,
            cost: CREDIT_COST_PER_CONVERSATION,
          })
        }

        try {
        // 4. Embed the question (Titan v2, 1024 dims).
        const embeddingStarted = Date.now()
        const embedding = await embedQuestion({
          question: body.message,
          modelId: env.embedModelId,
          region: env.bedrockRegion,
        })
        const embeddingMs = Date.now() - embeddingStarted

        // 5. Retrieve top-K chunks (filters from the chatbot row only).
        const retrievalStarted = Date.now()
        const query =
          deps.neonQuery ??
          neonQueryFn(await resolveNeonUrl(env.neonParameterName))
        const chunks = await retrieveChunks({
          query,
          chatbotId: scope.chatbotId,
          companyId: scope.companyId,
          embedding,
          topK: env.topK,
        })
        const retrievalMs = Date.now() - retrievalStarted

        // 5.5 Conversation ownership check (cross-tenant leak guard):
        // the client-supplied conversation_id is only honored when the
        // conversation row belongs to the resolved scope (chatbotId AND
        // companyId). On mismatch or missing row, treat it as absent and
        // start a fresh conversation - nothing foreign is read or written.
        let conversationId: string = randomUUID()
        if (body.conversation_id) {
          const convResp = await ddb.send(
            new GetCommand({
              TableName: env.conversationsTable,
              Key: { id: body.conversation_id },
            }),
          )
          const conv = convResp.Item as
            | { chatbotId?: string; companyId?: string }
            | undefined
          if (
            conv?.chatbotId === scope.chatbotId &&
            conv?.companyId === scope.companyId
          ) {
            conversationId = body.conversation_id
          }
        }

        // 6. Rolling context (last N turns) - only from DynamoDB (R-6),
        // and only for a conversation that passed the ownership check.
        const history =
          body.conversation_id && conversationId === body.conversation_id
            ? await loadHistory(ddb, {
                messagesTable: env.messagesTable,
                conversationId,
                turns: env.contextTurns,
              })
            : undefined

        // 7. Build prompt (system prompt precedence + delimited chunks).
        const prompt = buildPrompt({ scope, chunks, message: body.message, history })

        // 8. Claude completion.
        const completionStarted = Date.now()
        const completion = await completeBedrock(
          {
            prompt,
            modelId: env.chatModelId,
            region: env.bedrockRegion,
            maxTokens: env.maxTokens,
            temperature: env.temperature,
          },
        )
        const completionMs = Date.now() - completionStarted

        // AC 9: zero retrieval rows MUST answer with the configured
        // fallback - never an ungrounded completion, never an empty 200,
        // never a 500.
        const answer =
          chunks.length > 0 ? completion.answer : env.fallbackAnswer

        // 9. Persist the turn with exact token counts (R-8).
        const visitorId = hashVisitorId(
          (request.ip ?? '') as string,
          (request.headers['user-agent'] ?? '') as string,
        )
        await persistTurn(ddb, {
          conversationsTable: env.conversationsTable,
          messagesTable: env.messagesTable,
          chatbotId: scope.chatbotId,
          companyId: scope.companyId,
          conversationId,
          visitorId,
          question: body.message,
          answer,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
        })

        logStructured('info', 'chat:completed', {
          request_id: requestId,
          chatbot_id: scope.chatbotId,
          company_id: scope.companyId,
          conversation_id: conversationId,
          model_id: completion.modelId,
          latency_ms: Date.now() - started,
          retrieval_ms: retrievalMs,
          embedding_ms: embeddingMs,
          completion_ms: completionMs,
          input_tokens: completion.inputTokens,
          output_tokens: completion.outputTokens,
          source_count: chunks.length,
        })

        // 10. Atomically bump the monthly conversation counter (ADR-005):
        // keeps the 100% hard block and the 80% alert accurate between
        // nightly aggregations. Does not move the check, just increments.
        await ddb.send(
          new UpdateCommand({
            TableName: env.subscriptionsTable,
            Key: { id: scope.companyId },
            UpdateExpression: 'ADD monthlyUsed :one',
            ExpressionAttributeValues: { ':one': 1 },
          }),
        )

        return reply.code(200).send({
          data: {
            answer,
            conversation_id: conversationId,
            sources: chunks.map((c) => ({ id: c.id, content: c.content, score: c.score })),
          },
        })
      } catch (err) {
        // JD-B-003 compensation: the prepaid debit already happened, so any
        // failure afterwards gets a best-effort refund. A refund failure
        // must never mask the original error.
        if (snapshot.creditsOptedIn) {
          try {
            await ddb.send(
              new UpdateCommand({
                TableName: env.creditsTable,
                Key: { id: scope.companyId },
                UpdateExpression: 'ADD balance :one',
                ExpressionAttributeValues: {
                  ':one': CREDIT_COST_PER_CONVERSATION,
                },
              }),
            )
          } catch {
            // best-effort only
          }
        }
        throw err
      }
      } catch (err) {
        if (err instanceof RetrievalError) {
          const status = statusCodeFor(err)
          logStructured(status >= 500 ? 'error' : 'info', 'chat:error', {
            request_id: requestId,
            chatbot_id: chatbotId,
            error_class: err.code,
            latency_ms: Date.now() - started,
          })
          return reply.code(status).send(errorPayload(err, path))
        }
        logStructured('error', 'chat:unhandled', {
          request_id: requestId,
          chatbot_id: chatbotId,
          error_class: (err as Error)?.name ?? 'Error', error_msg: (err as Error)?.message, stack: (err as Error)?.stack,
          latency_ms: Date.now() - started,
        })
        return reply
          .code(500)
          .send(errorPayload(new Error('Internal server error'), path))
      }
    },
  )
}

export interface ChatPublicMessageDeps {
  /** Injected Neon query fn (tests); production resolves the SSM Neon URL. */
  neonQuery?: NeonQueryFn
}

export async function chatPublicMessageFactory(
  env: ChatRouteEnv,
  deps: ChatPublicMessageDeps = {},
) {
  const fastify = Fastify()
  await fastify.register(chatPublicMessagePlugin, { env, deps })
  return fastify
}

export { chatPublicMessagePlugin }
