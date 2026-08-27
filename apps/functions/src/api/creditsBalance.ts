import Fastify, { type FastifyPluginAsync } from 'fastify'
import { get, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

interface PluginOpts {
  preHook: UserPreHook
}

/**
 * Fastify plugin for the admin `GET /api/credits/balance` route. Mounted
 * under a `/api/credits/balance` prefix in the server bootstrap.
 */
const creditsBalancePlugin: FastifyPluginAsync<PluginOpts> = async (
  fastify,
  opts
) => {
  fastify.addHook('onRequest', opts.preHook)

  // GET / - Get user's credit balance
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Credits'],
        summary: 'Get user credit balance',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  balance: { type: 'integer', minimum: 0 },
                },
                required: ['balance'],
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
        },
      },
    },
    async (request, reply) => {
      const userId = (request as { user?: { sub?: string } }).user?.sub

      if (!userId) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthenticated',
          code: 'UNAUTHENTICATED',
        })
      }

      const credit = await get(TABLES.CREDITS, { userId })
      const balance = credit ? credit.balance : 0
      return { success: true, data: { balance } }
    }
  )
}

/**
 * Test-friendly wrapper. Spins up a fresh Fastify, registers the plugin
 * with the given preHook, and returns the instance so callers can use
 * `fastify.inject` for unit tests.
 */
export async function creditsBalanceFactory(preHook: UserPreHook) {
  const fastify = Fastify()
  await fastify.register(creditsBalancePlugin, { preHook })
  return fastify
}

export { creditsBalancePlugin }
