import Fastify from 'fastify'
import { get, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

export async function creditsBalanceFactory(preHook?: UserPreHook) {
  const fastify = Fastify()

  if (preHook) {
    fastify.addHook('onRequest', preHook)
  }

  // GET /api/credits/balance - Get user's credit balance
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
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user?.sub || 'anonymous'

      const credit = await get(TABLES.CREDITS, { userId })
      const balance = credit ? credit.balance : 0
      return { success: true, data: { balance } }
    }
  )

  return fastify
}
