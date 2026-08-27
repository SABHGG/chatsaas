import Fastify from 'fastify'
import { ZodTypeProvider } from 'fastify-zod'
import { scan, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

export async function creditsBalanceFactory(preHook?: UserPreHook) {
  const fastify = Fastify().withTypeProvider<ZodTypeProvider>()

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

      const items = await scan<any>(TABLES.CREDITS)
      const credit = items.find((item) => item.userId === userId)

      const balance = credit ? credit.balance : 0
      return { success: true, data: { balance } }
    }
  )

  return fastify
}

export type { creditsBalanceFactory }