import Fastify from 'fastify'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { get, updateExpr, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

export async function creditsDebitFactory(preHook?: UserPreHook) {
  const fastify = Fastify()

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
            amount: { type: 'integer', minimum: 1 },
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

      try {
        const attrs = await updateExpr(
          TABLES.CREDITS,
          { userId },
          'SET balance = balance - :amount',
          { ':amount': amount },
          'balance >= :amount AND attribute_exists(userId)'
        )

        return {
          success: true,
          data: { newBalance: attrs.balance },
        }
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
          return reply.code(402).send({
            success: false,
            error: 'Insufficient credits',
            code: 'INSUFFICIENT_CREDITS',
          })
        }
        throw err
      }
    }
  )

  return fastify
}
