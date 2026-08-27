import Fastify, { type FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { scan, put, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

/**
 * Fastify plugin for the public, anonymous chat surface
 * (`GET /api/chat/public`, `POST /api/chat/public`). No auth hook is
 * registered here — the server intentionally mounts this plugin without a
 * `preHook` and a per-route `userId` of `'anonymous'` is the
 * documented default when no `request.user` is present.
 *
 * The plugin still accepts a `preHook` option for test scenarios where the
 * test wants to inject a fake user; in that case the handler uses
 * `request.user.sub` if present.
 */
const chatPublicPlugin: FastifyPluginAsync<{ preHook?: UserPreHook }> = async (
  fastify,
  opts
) => {
  if (opts.preHook) {
    fastify.addHook('onRequest', opts.preHook)
  }

  // GET / - List recent public messages
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Chat'],
        summary: 'List recent public messages',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    content: { type: 'string' },
                    username: { type: 'string', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                    type: { type: 'string' },
                  },
                  required: ['id', 'content', 'createdAt', 'type'],
                  additionalProperties: false,
                },
              },
            },
            required: ['success', 'data'],
          },
        },
      },
    },
    async (request) => {
      const limit = (request.query as { limit?: number }).limit ?? 50
      const items = await scan<{
        id: string
        content: string
        username?: string
        createdAt: string
        type: string
      }>(TABLES.CHAT_MESSAGES)
      const messages = items
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, limit)
      return { success: true, data: messages }
    }
  )

  // POST / - Publish a new public message
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Publish a new public message',
        body: {
          type: 'object',
          properties: {
            content: { type: 'string', minLength: 1, maxLength: 2000 },
            username: { type: 'string', minLength: 1, maxLength: 50, nullable: true },
          },
          required: ['content'],
          additionalProperties: false,
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  content: { type: 'string' },
                  username: { type: 'string', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  type: { type: 'string' },
                },
                required: ['id', 'content', 'createdAt', 'type'],
                additionalProperties: false,
              },
            },
            required: ['success', 'data'],
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { content, username } = request.body as {
        content: string
        username?: string
      }

      const userId =
        (request as { user?: { sub?: string } }).user?.sub || 'anonymous'

      const message: Record<string, unknown> = {
        id: uuidv4(),
        content,
        type: 'text',
        createdAt: new Date().toISOString(),
        userId,
      }
      // Only include username when defined; the DocumentClient is configured
      // with removeUndefinedValues:true, but explicit omission keeps the stored
      // shape clean and the response mapping trivial.
      if (username !== undefined) {
        message.username = username
      }

      await put(TABLES.CHAT_MESSAGES, message)

      return reply.code(201).send({
        success: true,
        data: {
          id: message.id,
          content: message.content,
          username: message.username ?? null,
          createdAt: message.createdAt,
          type: message.type,
        },
      })
    }
  )
}

export async function chatPublicFactory(preHook?: UserPreHook) {
  const fastify = Fastify()
  await fastify.register(chatPublicPlugin, { preHook })
  return fastify
}

export { chatPublicPlugin }
