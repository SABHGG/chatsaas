import Fastify, { type FastifyPluginAsync } from 'fastify'
import { get, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

interface PluginOpts {
  preHook: UserPreHook
}

/**
 * Fastify plugin for the admin `GET /api/content/:id` route.
 */
const contentGetPlugin: FastifyPluginAsync<PluginOpts> = async (
  fastify,
  opts
) => {
  fastify.addHook('onRequest', opts.preHook)

  // GET /:id - Get content by ID
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
          401: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              code: { type: 'string' },
            },
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
      const userId = (request as { user?: { sub?: string } }).user?.sub

      if (!userId) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthenticated',
          code: 'UNAUTHENTICATED',
        })
      }

      const content = await get(TABLES.CONTENT, { id })

      if (!content) {
        return reply.code(404).send({
          success: false,
          error: 'Content not found',
        })
      }

      return { success: true, data: content }
    }
  )
}

export async function contentGetFactory(preHook: UserPreHook) {
  const fastify = Fastify()
  await fastify.register(contentGetPlugin, { preHook })
  return fastify
}

export { contentGetPlugin }
