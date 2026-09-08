import Fastify, { type FastifyPluginAsync } from 'fastify'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import type { ChatbotRecord } from '@/retrieval/types'
import { iframeSnippet } from './chatbots'

interface PluginOpts {
  chatbotsTable: string
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

const PUBLIC_CHAT_BASE_URL_DEFAULT = 'https://chat.chatsaas.local'

function publicChatUrl(chatbotId: string): string {
  const base = process.env.PUBLIC_CHAT_BASE_URL?.replace(/\/+$/, '') || PUBLIC_CHAT_BASE_URL_DEFAULT
  return `${base}/${chatbotId}`
}

function ddb(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({}))
}

/**
 * Load the chatbot row and return it only when status is `published`.
 * Drafts and archived chatbots 404 — deliberately not 403 — so existence of
 * unpublished chatbots is not leaked to anonymous visitors (same convention
 * as the WI-006 public chat route).
 */
async function getPublishedChatbot(client: DynamoDBDocumentClient, chatbotsTable: string, chatbotId: string) {
  const out = await client.send(new GetCommand({ TableName: chatbotsTable, Key: { id: chatbotId } }))
  const record = out.Item as ChatbotRecord | undefined
  if (!record || record.status !== 'published') return null
  return record
}

/**
 * WI-001 public widget surface. Anonymous by design — same precedent as the
 * WI-006 `/api/public/chat` route. No auth hook is attached; the chatbot row
 * is the only tenant-scope source, and only published rows are ever served.
 */
const chatbotsPublicPlugin: FastifyPluginAsync<PluginOpts> = async (fastify, opts) => {
  // GET /:chatbotId/config — widget initialization payload.
  fastify.get(
    '/:chatbotId/config',
    {
      schema: {
        tags: ['PublicChatbots'],
        summary: 'Public chatbot config for widget initialization',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  chatbotId: { type: 'string' },
                  name: { type: 'string' },
                  status: { type: 'string', enum: ['published'] },
                  expires_at: { type: 'null' },
                },
                required: ['chatbotId', 'name', 'status', 'expires_at'],
                additionalProperties: false,
              },
            },
            required: ['success', 'data'],
          },
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { chatbotId } = request.params as { chatbotId: string }
      const record = await getPublishedChatbot(ddb(), opts.chatbotsTable, chatbotId)
      if (!record) {
        return reply
          .code(404)
          .send({ success: false, error: 'Chatbot not found', code: 'CHATBOT_NOT_FOUND' })
      }
      return {
        success: true,
        data: { chatbotId: record.id, name: record.name, status: 'published', expires_at: null },
      }
    }
  )

  // GET /:chatbotId/iframe — embed snippet for the published chatbot.
  fastify.get(
    '/:chatbotId/iframe',
    {
      schema: {
        tags: ['PublicChatbots'],
        summary: 'Public iframe embed snippet',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  iframe_src: { type: 'string' },
                  expires_at: { type: 'null' },
                },
                required: ['iframe_src', 'expires_at'],
                additionalProperties: false,
              },
            },
            required: ['success', 'data'],
          },
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { chatbotId } = request.params as { chatbotId: string }
      const record = await getPublishedChatbot(ddb(), opts.chatbotsTable, chatbotId)
      if (!record) {
        return reply
          .code(404)
          .send({ success: false, error: 'Chatbot not found', code: 'CHATBOT_NOT_FOUND' })
      }
      return {
        success: true,
        data: { iframe_src: iframeSnippet(publicChatUrl(record.id)), expires_at: null },
      }
    }
  )
}

/**
 * Test-friendly wrapper (same convention as the WI-002 plugins).
 */
export async function chatbotsPublicFactory(env: { chatbotsTable: string }) {
  const fastify = Fastify()
  await fastify.register(chatbotsPublicPlugin, { chatbotsTable: env.chatbotsTable })
  return fastify
}

export { chatbotsPublicPlugin }
