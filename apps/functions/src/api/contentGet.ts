import Fastify from 'fastify'
import { scan, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

export async function contentGetFactory(preHook?: UserPreHook) {
  const fastify = Fastify()

  if (preHook) {
    fastify.addHook('onRequest', preHook)
  }

  // GET /api/content/:id - Get content by ID
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Content'],
        summary: 'Get content by ID',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string', nullable: true },
                  message: { type: 'string', nullable: true },
                  authorId: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  status: { type: 'string' },
                },
                required: ['id', 'title', 'authorId', 'createdAt', 'status'],
                additionalProperties: false,
              },
            },
            required: ['success', 'data'],
          },
          404: {
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
      const { id } = request.params as { id: string }

      const items = await scan<any>(TABLES.CONTENT)
      const content = items.find((item) => item.id === id)

      if (!content) {
        return reply.code(404).send({
          success: false,
          error: 'Content not found',
        })
      }

      return { success: true, data: content }
    }
  )

  return fastify
}