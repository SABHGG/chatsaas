import Fastify from 'fastify'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { get, put, updateExpr, TABLES } from '@/lib/db'
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
            amount: { type: 'integer', minimum: 1 },
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
          404: {
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
      const now = new Date().toISOString()

      // Check if a credit record exists.
      const existing = await get(TABLES.CREDITS, { userId })

      if (existing) {
        // Atomic increment with condition that the row still exists.
        try {
          const attrs = await updateExpr(
            TABLES.CREDITS,
            { userId },
            'SET balance = balance + :amount, updatedAt = :now',
            { ':amount': amount, ':now': now },
            'attribute_exists(userId)'
          )
          return {
            success: true,
            data: { newBalance: attrs.balance },
          }
        } catch (err) {
          if (err instanceof ConditionalCheckFailedException) {
            return reply.code(404).send({
              success: false,
              error: 'Credit record disappeared during replenish',
              code: 'NOT_FOUND',
            })
          }
          throw err
        }
      } else {
        // Create the credit record. The condition prevents overwriting a
        // concurrent create from another request.
        try {
          await put(TABLES.CREDITS, {
            userId,
            balance: amount,
            createdAt: now,
            updatedAt: now,
          })
        } catch (err) {
          if (err instanceof ConditionalCheckFailedException) {
            // Another request created the record first; retry as an increment.
            const attrs = await updateExpr(
              TABLES.CREDITS,
              { userId },
              'SET balance = balance + :amount, updatedAt = :now',
              { ':amount': amount, ':now': now }
            )
            return {
              success: true,
              data: { newBalance: attrs.balance },
            }
          }
          throw err
        }
        return {
          success: true,
          data: { newBalance: amount },
        }
      }
    }
  )

  return fastify
}
