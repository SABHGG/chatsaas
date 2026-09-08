import Fastify, { type FastifyPluginAsync } from 'fastify'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { TenantResolutionError } from '@/ingest/types'
import { resolveTenant } from '@/ingest/resolveTenant'
import type { UserPreHook } from './hooks'
import type { CognitoAccessTokenClaims } from '@/auth/claims'
import type { DocumentRecord } from '@/ingest/types'

interface PluginOpts {
  preHook: UserPreHook
  documentsTable: string
}

const documentGetPlugin: FastifyPluginAsync<PluginOpts> = async (
  fastify,
  opts
) => {
  fastify.addHook('onRequest', opts.preHook)

  fastify.get(
    '/:documentId',
    {
      schema: {
        tags: ['Documents'],
        summary: 'Get a single document by id',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                additionalProperties: true,
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
      const documentId = (request.params as { documentId: string }).documentId
      if (!claims) {
        return reply
          .code(401)
          .send({ success: false, error: 'Unauthenticated', code: 'UNAUTHENTICATED' })
      }
      const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      })
      const out = await ddb.send(
        new GetCommand({ TableName: opts.documentsTable, Key: { id: documentId } }),
      )
      const row = (out.Item as DocumentRecord | undefined) ?? null
      if (!row) {
        return reply
          .code(404)
          .send({ success: false, error: 'Document not found', code: 'NOT_FOUND' })
      }
      try {
        await resolveTenant({
          jwtClaims: claims,
          pathParams: { chatbotId: row.chatbotId, documentId: row.id },
          documentRow: row,
          documentsTable: opts.documentsTable,
          ddb,
        })
      } catch (err) {
        if (err instanceof TenantResolutionError) {
          return reply
            .code(403)
            .send({ success: false, error: err.message, code: err.code })
        }
        throw err
      }
      return { success: true, data: row }
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

export async function documentGetFactory(
  preHook: UserPreHook,
  env: { documentsTable: string }
) {
  const fastify = Fastify()
  await fastify.register(documentGetPlugin, {
    preHook,
    documentsTable: env.documentsTable,
  })
  return fastify
}

export { documentGetPlugin }
