import Fastify from 'fastify'
import { scan, put, update, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

export async function creditsReplenishFactory(preHook?: UserPreHook) {
  const fastify = Fastify()

  if (preHook) {
    fastify.addHook('onRequest', preHook)
  }

  // POST /api/credits/replenish - Add credits to user balance
  fastify.post(
    '/replenish',
    {
      schema: {
        tags: ['Credits'],
        summary: 'Add credits to user balance',
        body: {
          type: 'object',
          properties: {
            amount: { type: 'number', minimum: 1 },
          },
          required: ['amount'],
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  newBalance: { type: 'integer', minimum: 0 },
                },
                required: ['newBalance'],
                additionalProperties: false,
              },
            },
            required: ['success', 'data'],
          },
        },
      },
    },
    async (request, reply) => {
      const { amount } = request.body as { amount: number }
      const userId = (request as any).user?.sub || 'anonymous'
      const now = new Date().toISOString()

      const items = await scan<any>(TABLES.CREDITS)
      const credit = items.find((item) => item.userId === userId)

      if (credit) {
        const newBalance = credit.balance + amount
        await update(TABLES.CREDITS, { userId }, { balance: newBalance, updatedAt: now })
        return {
          success: true,
          data: { newBalance },
        }
      } else {
        await put(TABLES.CREDITS, {
          userId,
          balance: amount,
          createdAt: now,
          updatedAt: now,
        })
        return {
          success: true,
          data: { newBalance: amount },
        }
      }
    }
  )

  return fastify
}