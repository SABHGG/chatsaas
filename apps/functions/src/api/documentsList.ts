import Fastify, { type FastifyPluginAsync } from 'fastify'
import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { TenantResolutionError, checkChatbotOwnership } from '@/ingest/resolveTenant'
import type { UserPreHook } from './hooks'
import type { CognitoAccessTokenClaims } from '@/auth/claims'
import type { DocumentRecord } from '@/ingest/types'

interface PluginOpts {
  preHook: UserPreHook
  documentsTable: string
  chatbotsTable: string
}

/**
 * The DocumentsTable schema (WI-005) is:
 *   PK = id (S)
 * We use a server-side filter for `(chatbotId, companyId)`; the Operator's
 * Board polls this route on the admin side and is happy with a 1-page
 * result. A future WI adds a GSI on `(chatbotId, createdAt)` for paging.
 */
const documentsListPlugin: FastifyPluginAsync<PluginOpts> = async (
  fastify,
  opts
) => {
  fastify.addHook('onRequest', opts.preHook)

  fastify.get(
    '/:chatbotId/documents',
    {
      schema: {
        tags: ['Documents'],
        summary: 'List documents for a chatbot',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  documents: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
                  },
                },
                required: ['documents'],
                additionalProperties: false,
              },
            },
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
      const chatbotId = (request.params as { chatbotId: string }).chatbotId
      if (!claims) {
        return reply
          .code(401)
          .send({ success: false, error: 'Unauthenticated', code: 'UNAUTHENTICATED' })
      }
      const companyId = (claims as CognitoAccessTokenClaims)['custom:company_id'] as
        | string
        | undefined
      if (!companyId) {
        return reply
          .code(403)
          .send({ success: false, error: 'Missing company_id', code: 'MISSING_COMPANY' })
      }

      // Check chatbot ownership before listing (cross-tenant 403 per spec).
      try {
        await checkChatbotOwnership({
          jwtClaims: claims as CognitoAccessTokenClaims,
          chatbotId,
          chatbotsTable: opts.chatbotsTable,
          ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
        })
      } catch (e) {
        if (e instanceof TenantResolutionError) {
          const code = e.code === "chatbot_not_found" ? 404 : 403
          return reply
            .code(code)
            .send({ success: false, error: e.message, code: e.code.toUpperCase() })
        }
        throw e
      }

      const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      })
      // Scan with a FilterExpression. A GSI on (chatbotId, createdAt) is
      // a follow-up; for MVP this is fine because each chatbot has a
      // small number of documents.
      const out = await ddb.send(
        new ScanCommand({
          TableName: opts.documentsTable,
          FilterExpression: 'chatbotId = :c AND companyId = :co',
          ExpressionAttributeValues: {
            ':c': chatbotId,
            ':co': companyId,
          },
          Limit: 100,
        })
      )
      const documents = (out.Items as DocumentRecord[] | undefined) ?? []
      // Sort client-side: newest first. Cheap because the filter already
      // limits to the chatbot scope.
      documents.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
      return { success: true, data: { documents } }
    }
  )
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

export async function documentsListFactory(
  preHook: UserPreHook,
  env: { documentsTable: string; chatbotsTable: string }
) {
  const fastify = Fastify()
  await fastify.register(documentsListPlugin, {
    preHook,
    documentsTable: env.documentsTable,
    chatbotsTable: env.chatbotsTable,
  })
  return fastify
}

export { documentsListPlugin }

// Re-export for the test suite
export { TenantResolutionError }