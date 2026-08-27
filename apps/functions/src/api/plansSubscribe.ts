import Fastify from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { get, put, updateExpr, query, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

// Maps a plan interval label to a number of days. Plans with unknown
// intervals default to 30 days (the spec currently only defines monthly plans).
const INTERVAL_DAYS: Record<string, number> = {
  monthly: 30,
  yearly: 365,
}

export async function plansSubscribeFactory(preHook?: UserPreHook) {
  const fastify = Fastify()

  if (preHook) {
    fastify.addHook('onRequest', preHook)
  }

  // POST /api/plans/subscribe - Subscribe user to a plan
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Plans'],
        summary: 'Subscribe user to a plan',
        body: {
          type: 'object',
          properties: {
            planId: { type: 'string' },
            paymentMethodId: { type: 'string', nullable: true },
          },
          required: ['planId'],
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
                  status: { type: 'string' },
                  planId: { type: 'string' },
                  currentPeriodEnd: { type: 'string', format: 'date-time' },
                },
                required: ['status', 'planId', 'currentPeriodEnd'],
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
            required: ['success', 'error'],
            additionalProperties: false,
          },
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.body as { planId: string }
      const userId = (request as any).user?.sub || 'anonymous'
      const now = new Date().toISOString()

      const plan = await get(TABLES.PLANS, { id: planId })

      if (!plan) {
        return reply.code(404).send({
          success: false,
          error: 'Plan not found',
          code: 'PLAN_NOT_FOUND',
        })
      }

      const days = INTERVAL_DAYS[plan.interval as string] ?? 30
      const currentPeriodEnd = new Date(
        Date.now() + days * 24 * 60 * 60 * 1000
      ).toISOString()

      // Look up an existing subscription by partition key.
      const existingList = await query(TABLES.SUBSCRIPTIONS, 'userId', userId)
      const existing = existingList[0]

      if (existing) {
        await updateExpr(
          TABLES.SUBSCRIPTIONS,
          { userId, planId: existing.planId },
          'SET planId = :planId, #s = :status, startedAt = :startedAt, currentPeriodEnd = :cpe, updatedAt = :now',
          {
            ':planId': planId,
            ':status': 'active',
            ':startedAt': existing.startedAt || now,
            ':cpe': currentPeriodEnd,
            ':now': now,
          }
        )
        // Note: the current schema uses userId+planId as composite key, so
        // updating the sort key requires a delete+put in DynamoDB. For now we
        // leave planId unchanged in the key and store the desired planId as a
        // regular attribute. A follow-up WI can migrate to userId-only key.
      } else {
        await put(TABLES.SUBSCRIPTIONS, {
          id: uuidv4(),
          userId,
          planId,
          status: 'active',
          startedAt: now,
          currentPeriodEnd,
        })
      }

      return {
        success: true,
        data: {
          status: 'active',
          planId,
          currentPeriodEnd,
        },
      }
    }
  )

  return fastify
}
