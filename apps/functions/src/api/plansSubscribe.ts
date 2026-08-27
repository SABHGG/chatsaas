import Fastify from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { get, put, updateExpr, query, del, TABLES } from '@/lib/db'
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

      // Look up an existing subscription by partition key. The schema declares
      // PK=userId, SK=planId, so a query against userId returns all of a
      // user's subscriptions (in practice one active row today).
      const existingList = await query(TABLES.SUBSCRIPTIONS, 'userId', userId)
      const existing = existingList[0]

      if (existing && existing.planId !== planId) {
        // Plan change: DynamoDB forbids updating a key attribute in place, so
        // we delete the old row and put the new one. The `del` is best-effort;
        // if it fails because the row was already removed by a concurrent
        // request we proceed with the put.
        try {
          await del(TABLES.SUBSCRIPTIONS, {
            userId,
            planId: existing.planId,
          })
        } catch {
          // Ignore: another writer may have removed the old row.
        }
        await put(TABLES.SUBSCRIPTIONS, {
          id: uuidv4(),
          userId,
          planId,
          status: 'active',
          startedAt: existing.startedAt || now,
          currentPeriodEnd,
        })
      } else if (existing && existing.planId === planId) {
        // Same plan — just bump the period end atomically.
        await updateExpr(
          TABLES.SUBSCRIPTIONS,
          { userId, planId },
          'SET #s = :status, currentPeriodEnd = :cpe, updatedAt = :now',
          {
            ':status': 'active',
            ':cpe': currentPeriodEnd,
            ':now': now,
          }
        )
      } else {
        // No existing subscription — create.
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
