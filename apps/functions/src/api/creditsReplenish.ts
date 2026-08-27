import Fastify, { type FastifyPluginAsync } from 'fastify'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { get, put, updateExpr, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

interface PluginOpts {
  preHook: UserPreHook
}

/**
 * Fastify plugin for the admin `POST /api/credits/replenish` route.
 */
const creditsReplenishPlugin: FastifyPluginAsync<PluginOpts> = async (
  fastify,
  opts
) => {
  fastify.addHook('onRequest', opts.preHook)

  // POST /replenish - Add credits to user balance
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
              code: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { amount } = request.body as { amount: number }
      const userId = (request as { user?: { sub?: string } }).user?.sub

      if (!userId) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthenticated',
          code: 'UNAUTHENTICATED',
        })
      }

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
        // Create the credit record. The condition `attribute_not_exists(userId)`
        // makes this create-only: if a concurrent request beat us to it, the
        // PutItem is rejected and we fall through to the atomic increment path
        // so the first request's amount is not lost.
        try {
          await put(
            TABLES.CREDITS,
            {
              userId,
              balance: amount,
              createdAt: now,
              updatedAt: now,
            },
            {
              conditionExpression: 'attribute_not_exists(userId)',
            }
          )
        } catch (err) {
          if (err instanceof ConditionalCheckFailedException) {
            // Concurrent create happened first; merge via atomic increment.
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
}

export async function creditsReplenishFactory(preHook: UserPreHook) {
  const fastify = Fastify()
  await fastify.register(creditsReplenishPlugin, { preHook })
  return fastify
}

export { creditsReplenishPlugin }
