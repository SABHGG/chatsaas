import Fastify, { type FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { UserPreHook } from './hooks'
import type { CognitoAccessTokenClaims } from '@/auth/claims'
import type { ChatbotRecord } from '@/retrieval/types'
import { z } from 'zod'

// Strict body schemas use Zod (repo convention, see chatPublicMessage).
// Fastify's default Ajv uses removeAdditional, which would silently STRIP
// unknown fields instead of rejecting them — the opposite of the strict
// contract. JSON Schema is kept for params/query/response only.
const createBodySchema = z
  .strictObject({
    name: z.string().min(1).max(100),
    description: z.string().max(2000).nullable().optional(),
  })

const patchBodySchema = z
  .strictObject({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(2000).nullable().optional(),
  })

const publishBodySchema = z
  .strictObject({
    plan_id: z.string().min(1),
  })

// zod 4.5.4 AOT compile: these are the FINAL body schemas (nothing derives
// from them afterwards), so compiling the clones is safe. Compiled once at
// module load — not per request — to keep Lambda cold-start cost bounded.
// The originals stay uncompiled; z.compile returns a clone with the same
// type, and invalid bodies fall back to the runtime parser with identical
// ZodError reporting (the 400 handler below is unaffected).
const CompiledCreateBody = z.compile(createBodySchema)
const CompiledPatchBody = z.compile(patchBodySchema)
const CompiledPublishBody = z.compile(publishBodySchema)

interface PluginOpts {
  preHook: UserPreHook
  chatbotsTable: string
  /**
   * Documents table is optional: it is only used to compute `document_count`
   * on list responses. When absent, counts are reported as 0.
   */
  documentsTable?: string
}

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'string' },
    code: { type: 'string' },
  },
  required: ['success', 'error', 'code'],
} as const

const chatbotItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'published', 'archived'] },
    document_count: { type: 'integer', minimum: 0 },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    published_at: { type: ['string', 'null'] },
  },
  required: ['id', 'name', 'status', 'document_count', 'created_at', 'updated_at', 'published_at'],
  // NOTE: deliberately NOT additionalProperties:false — Fastify response
  // serialization would then strip the `url` / `iframe_src` fields added by
  // the /published route on top of the shared item shape.
} as const

const chatbotResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: chatbotItemSchema,
  },
  required: ['success', 'data'],
} as const

const listResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'array', items: chatbotItemSchema },
  },
  required: ['success', 'data'],
} as const

const publishedItemSchema = {
  type: 'object',
  properties: {
    ...chatbotItemSchema.properties,
    url: { type: 'string' },
    iframe_src: { type: 'string' },
  },
  required: [...(chatbotItemSchema.required as readonly string[]), 'url', 'iframe_src'],
  additionalProperties: false,
} as const

const publishedListResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'array', items: publishedItemSchema },
  },
  required: ['success', 'data'],
} as const

const publishResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['published'] },
        url: { type: 'string' },
        iframe_src: { type: 'string' },
        expires_at: { type: 'null' },
      },
      required: ['status', 'url', 'iframe_src', 'expires_at'],
      additionalProperties: false,
    },
  },
  required: ['success', 'data'],
} as const

const PUBLIC_CHAT_BASE_URL_DEFAULT = 'https://chat.chatsaas.local'

function publicChatBaseUrl(): string {
  return process.env.PUBLIC_CHAT_BASE_URL?.replace(/\/+$/, '') || PUBLIC_CHAT_BASE_URL_DEFAULT
}

function publicChatUrl(chatbotId: string): string {
  return `${publicChatBaseUrl()}/${chatbotId}`
}

export function iframeSnippet(url: string): string {
  return `<iframe src="${url}" width="100%" height="600" frameborder="0"></iframe>`
}

function ddb(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  })
}

/**
 * Map a ChatbotRecord to the wire shape used by all admin list/detail
 * responses. `documentCount` defaults to 0 when the documents table is not
 * wired (see PluginOpts.documentsTable).
 */
function toChatbotDto(record: ChatbotRecord, documentCount = 0) {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    document_count: documentCount,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    published_at: record.publishedAt ?? null,
  }
}

/**
 * Fetch the chatbot row and enforce tenant ownership.
 * Returns an error reply (404 missing, 403 foreign, 404 archived) or the row.
 */
async function getOwnedChatbot(
  client: DynamoDBDocumentClient,
  chatbotsTable: string,
  companyId: string,
  chatbotId: string
): Promise<{ ok: true; record: ChatbotRecord } | { ok: false; status: 403 | 404; code: string; error: string }> {
  const out = await client.send(
    new GetCommand({ TableName: chatbotsTable, Key: { id: chatbotId } })
  )
  const record = out.Item as ChatbotRecord | undefined
  if (!record) {
    return { ok: false, status: 404, code: 'CHATBOT_NOT_FOUND', error: 'Chatbot not found' }
  }
  // Tenant chain of custody: the companyId ALWAYS comes from the verified
  // JWT claim, never from the request. The row's companyId must match.
  if (record.companyId !== companyId) {
    return { ok: false, status: 403, code: 'FORBIDDEN', error: 'Chatbot belongs to another company' }
  }
  if (record.status === 'archived') {
    return { ok: false, status: 404, code: 'CHATBOT_NOT_FOUND', error: 'Chatbot not found' }
  }
  return { ok: true, record }
}

/**
 * Count documents per chatbot for one company. MVP tradeoff: the documents
 * table has PK=id with no (companyId) GSI, so this is a server-side filtered
 * Scan — the same pattern as documentsList. Fine while a company's document
 * count stays small; a GSI is the follow-up when it does not.
 */
async function documentCountsByChatbot(
  client: DynamoDBDocumentClient,
  documentsTable: string,
  companyId: string
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (!documentsTable) return counts
  let exclusiveStartKey: Record<string, unknown> | undefined
  do {
    const out = await client.send(
      new ScanCommand({
        TableName: documentsTable,
        FilterExpression: 'companyId = :co',
        ExpressionAttributeValues: { ':co': companyId },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    )
    for (const item of (out.Items as Array<{ chatbotId?: string }> | undefined) ?? []) {
      if (item.chatbotId) {
        counts.set(item.chatbotId, (counts.get(item.chatbotId) ?? 0) + 1)
      }
    }
    exclusiveStartKey = out.LastEvaluatedKey
  } while (exclusiveStartKey)
  return counts
}

/**
 * WI-001 admin chatbot CRUD + publishing surface. All routes are mounted
 * behind the Cognito JWT preHook. Tenant scope comes exclusively from the
 * `custom:company_id` claim (WI-008 chain of custody), never from the body.
 */
const chatbotsPlugin: FastifyPluginAsync<PluginOpts> = async (fastify, opts) => {
  fastify.addHook('onRequest', opts.preHook)

  fastify.setErrorHandler((err, _request, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        issues: err.issues,
      })
    }
    const fastifyErr = err as { statusCode?: number; message?: string }
    if (
      typeof fastifyErr.statusCode === 'number' &&
      fastifyErr.statusCode >= 400 &&
      fastifyErr.statusCode < 500
    ) {
      return reply.code(fastifyErr.statusCode).send({
        success: false,
        error: fastifyErr.message ?? 'Bad request',
        code: 'VALIDATION_ERROR',
      })
    }
    reply.log.error({ err }, 'unhandled error')
    return reply.code(500).send({ success: false, error: 'Internal server error' })
  })

  // GET / — list chatbots for the caller's company (draft + published).
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Chatbots'],
        summary: 'List chatbots for the caller\u2019s company',
        response: {
          200: listResponseSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const claims = (request as { user?: CognitoAccessTokenClaims }).user
      const companyId = claims?.['custom:company_id']
      if (!claims || !companyId) {
        return reply
          .code(claims ? 403 : 401)
          .send({
            success: false,
            error: claims ? 'Missing company_id' : 'Unauthenticated',
            code: claims ? 'MISSING_COMPANY' : 'UNAUTHENTICATED',
          })
      }
      const client = ddb()
      // No (companyId) GSI on the chatbots table yet: filtered Scan, same
      // MVP tradeoff as documentCountsByChatbot.
      const out = await client.send(
        new ScanCommand({
          TableName: opts.chatbotsTable,
          FilterExpression: 'companyId = :co AND #s <> :archived',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':co': companyId, ':archived': 'archived' },
        })
      )
      const records = (out.Items as ChatbotRecord[] | undefined) ?? []
      records.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
      const counts = await documentCountsByChatbot(client, opts.documentsTable ?? '', companyId)
      return {
        success: true,
        data: records.map((r) => toChatbotDto(r, counts.get(r.id) ?? 0)),
      }
    }
  )

  // GET /published — list published chatbots, with URL + iframe snippet.
  fastify.get(
    '/published',
    {
      schema: {
        tags: ['Chatbots'],
        summary: 'List published chatbots for the caller\u2019s company',
        response: {
          200: publishedListResponseSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const claims = (request as { user?: CognitoAccessTokenClaims }).user
      const companyId = claims?.['custom:company_id']
      if (!claims || !companyId) {
        return reply
          .code(claims ? 403 : 401)
          .send({
            success: false,
            error: claims ? 'Missing company_id' : 'Unauthenticated',
            code: claims ? 'MISSING_COMPANY' : 'UNAUTHENTICATED',
          })
      }
      const client = ddb()
      const out = await client.send(
        new ScanCommand({
          TableName: opts.chatbotsTable,
          FilterExpression: 'companyId = :co AND #s = :published',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':co': companyId, ':published': 'published' },
        })
      )
      const records = (out.Items as ChatbotRecord[] | undefined) ?? []
      records.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
      const counts = await documentCountsByChatbot(client, opts.documentsTable ?? '', companyId)
      return {
        success: true,
        data: records.map((r) => {
          const dto = toChatbotDto(r, counts.get(r.id) ?? 0) as Record<string, unknown>
          const url = publicChatUrl(r.id)
          dto.url = url
          dto.iframe_src = iframeSnippet(url)
          return dto
        }),
      }
    }
  )

  // POST / — create a draft chatbot.
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Chatbots'],
        summary: 'Create a chatbot (draft)',
        response: {
          201: chatbotResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const claims = (request as { user?: CognitoAccessTokenClaims }).user
      const companyId = claims?.['custom:company_id']
      if (!claims || !companyId) {
        return reply
          .code(claims ? 403 : 401)
          .send({
            success: false,
            error: claims ? 'Missing company_id' : 'Unauthenticated',
            code: claims ? 'MISSING_COMPANY' : 'UNAUTHENTICATED',
          })
      }
      const parsed = CompiledCreateBody.safeParse(request.body)
      if (!parsed.success) {
        throw parsed.error
      }
      const body = parsed.data
      const now = new Date().toISOString()
      const record: ChatbotRecord & { description?: string | null } = {
        id: randomUUID(),
        companyId,
        ownerSub: claims.sub,
        name: body.name,
        status: 'draft',
        settings: {},
        createdAt: now,
        updatedAt: now,
        ...(body.description !== undefined ? { description: body.description } : {}),
      }
      await ddb().send(
        new PutCommand({
          TableName: opts.chatbotsTable,
          Item: record,
          ConditionExpression: 'attribute_not_exists(id)',
        })
      )
      return reply.code(201).send({ success: true, data: toChatbotDto(record) })
    }
  )

  // PATCH /:id — update metadata (name, description).
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['Chatbots'],
        summary: 'Update chatbot metadata',
        response: {
          200: chatbotResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const claims = (request as { user?: CognitoAccessTokenClaims }).user
      const companyId = claims?.['custom:company_id']
      if (!claims || !companyId) {
        return reply
          .code(claims ? 403 : 401)
          .send({
            success: false,
            error: claims ? 'Missing company_id' : 'Unauthenticated',
            code: claims ? 'MISSING_COMPANY' : 'UNAUTHENTICATED',
          })
      }
      const { id } = request.params as { id: string }
      const parsedPatch = CompiledPatchBody.safeParse(request.body)
      if (!parsedPatch.success) {
        throw parsedPatch.error
      }
      const body = parsedPatch.data
      const client = ddb()
      const owned = await getOwnedChatbot(client, opts.chatbotsTable, companyId, id)
      if (!owned.ok) {
        return reply
          .code(owned.status)
          .send({ success: false, error: owned.error, code: owned.code })
      }
      const now = new Date().toISOString()
      const setParts: string[] = ['#updatedAt = :now']
      const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
      const values: Record<string, unknown> = { ':now': now }
      if (body.name !== undefined) {
        setParts.push('#name = :name')
        names['#name'] = 'name'
        values[':name'] = body.name
      }
      if (body.description !== undefined) {
        setParts.push('#description = :description')
        names['#description'] = 'description'
        values[':description'] = body.description
      }
      const out = await client.send(
        new UpdateCommand({
          TableName: opts.chatbotsTable,
          Key: { id },
          UpdateExpression: `SET ${setParts.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        })
      )
      return { success: true, data: toChatbotDto(out.Attributes as ChatbotRecord) }
    }
  )

  // DELETE /:id — soft delete (status archived).
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Chatbots'],
        summary: 'Archive a chatbot (soft delete)',
        response: {
          200: {
            type: 'object',
            properties: { success: { type: 'boolean' }, data: { type: 'null' } },
            required: ['success', 'data'],
          },
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const claims = (request as { user?: CognitoAccessTokenClaims }).user
      const companyId = claims?.['custom:company_id']
      if (!claims || !companyId) {
        return reply
          .code(claims ? 403 : 401)
          .send({
            success: false,
            error: claims ? 'Missing company_id' : 'Unauthenticated',
            code: claims ? 'MISSING_COMPANY' : 'UNAUTHENTICATED',
          })
      }
      const { id } = request.params as { id: string }
      const client = ddb()
      const owned = await getOwnedChatbot(client, opts.chatbotsTable, companyId, id)
      if (!owned.ok) {
        return reply
          .code(owned.status)
          .send({ success: false, error: owned.error, code: owned.code })
      }
      await client.send(
        new UpdateCommand({
          TableName: opts.chatbotsTable,
          Key: { id },
          UpdateExpression: 'SET #s = :archived, #updatedAt = :now',
          ExpressionAttributeNames: { '#s': 'status', '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: { ':archived': 'archived', ':now': new Date().toISOString() },
        })
      )
      return { success: true, data: null }
    }
  )

  // POST /:chatbotId/publish — publish the chatbot (idempotent).
  fastify.post(
    '/:chatbotId/publish',
    {
      schema: {
        tags: ['Chatbots'],
        summary: 'Publish a chatbot and return its public URL + iframe snippet',
        response: {
          202: publishResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const claims = (request as { user?: CognitoAccessTokenClaims }).user
      const companyId = claims?.['custom:company_id']
      if (!claims || !companyId) {
        return reply
          .code(claims ? 403 : 401)
          .send({
            success: false,
            error: claims ? 'Missing company_id' : 'Unauthenticated',
            code: claims ? 'MISSING_COMPANY' : 'UNAUTHENTICATED',
          })
      }
      const { chatbotId } = request.params as { chatbotId: string }
      // Validate the body BEFORE any data access: an invalid publish request
      // must cost zero reads and return 400 (see chatbots.test.ts).
      const parsedPublish = CompiledPublishBody.safeParse(request.body)
      if (!parsedPublish.success) {
        throw parsedPublish.error
      }
      const { plan_id } = parsedPublish.data
      const client = ddb()
      const owned = await getOwnedChatbot(client, opts.chatbotsTable, companyId, chatbotId)
      if (!owned.ok) {
        return reply
          .code(owned.status)
          .send({ success: false, error: owned.error, code: owned.code })
      }
      const now = new Date().toISOString()
      // Idempotent: re-publishing just refreshes the timestamps/plan.
      await client.send(
        new UpdateCommand({
          TableName: opts.chatbotsTable,
          Key: { id: chatbotId },
          UpdateExpression: 'SET #s = :published, publishedAt = :now, planId = :plan, #updatedAt = :now',
          ExpressionAttributeNames: { '#s': 'status', '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: {
            ':published': 'published',
            ':now': now,
            ':plan': plan_id,
          },
        })
      )
      const url = publicChatUrl(chatbotId)
      return reply.code(202).send({
        success: true,
        data: { status: 'published', url, iframe_src: iframeSnippet(url), expires_at: null },
      })
    }
  )
}

/**
 * Test-friendly wrapper (same convention as the WI-002 plugins).
 */
export async function chatbotsFactory(
  preHook: UserPreHook,
  env: { chatbotsTable: string; documentsTable?: string }
) {
  const fastify = Fastify()
  await fastify.register(chatbotsPlugin, {
    preHook,
    chatbotsTable: env.chatbotsTable,
    documentsTable: env.documentsTable,
  })
  return fastify
}

export { chatbotsPlugin }
