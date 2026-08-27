import Fastify from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { scan, put, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

export async function chatPublicFactory(preHook?: UserPreHook) {
  const fastify = Fastify()

  if (preHook) {
    fastify.addHook('onRequest', preHook)
  }

  // GET /api/chat/public - List recent public messages
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Chat'],
        summary: 'List recent public messages',
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
    async (request, reply) => {
      const limit = Number((request.query as any)?.limit) || 50
      const items = await scan<any>(TABLES.CHAT_MESSAGES)
      const messages = items
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit)
      return { success: true, data: messages }
    }
  )

  // POST /api/chat/public - Publish a new public message
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

      const message = {
        id: uuidv4(),
        content,
        username,
        type: 'text',
        createdAt: new Date().toISOString(),
        userId: (request as any).user?.sub || 'anonymous',
      }

      await put(TABLES.CHAT_MESSAGES, message)

      return reply.code(201).send({
        success: true,
        data: {
          id: message.id,
          content: message.content,
          username: message.username,
          createdAt: message.createdAt,
          type: message.type,
        },
      })
    }
  )

  return fastify
}