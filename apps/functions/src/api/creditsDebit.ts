import Fastify from 'fastify'
import { ZodTypeProvider } from 'fastify-zod'
import { scan, update, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

export async function creditsDebitFactory(preHook?: UserPreHook) {
  const fastify = Fastify().withTypeProvider<ZodTypeProvider>()

  if (preHook) {
    fastify.addHook('onRequest', preHook)
  }

  // POST /api/credits/debit - Debit credits for an action
  fastify.post(
    '/debit',
    {
      schema: {
        tags: ['Credits'],
        summary: 'Debit credits for an action',
        body: {
          type: 'object',
          properties: {
            amount: { type: 'number', minimum: 1 },
            reason: { type: 'string', nullable: true },
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
          402: {
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
      const { amount } = request.body as { amount: number }
      const userId = (request as any).user?.sub || 'anonymous'

      const items = await scan<any>(TABLES.CREDITS)
      const credit = items.find((item) => item.userId === userId)

      if (!credit || credit.balance < amount) {
        return reply.code(402).send({
          success: false,
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
        })
      }

      const newBalance = credit.balance - amount
      await update(TABLES.CREDITS, { userId }, { balance: newBalance })

      return {
        success: true,
        data: { newBalance },
      }
    }
  )

  return fastify
}

export type { creditsDebitFactory }