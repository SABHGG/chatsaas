import Fastify from 'fastify'
import { ZodTypeProvider } from 'fastify-zod'
import { v4 as uuidv4 } from 'uuid'
import { scan, put, update, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

// Maps a plan interval label to a number of days. Plans with unknown
// intervals default to 30 days (the spec currently only defines monthly plans).
const INTERVAL_DAYS: Record<string, number> = {
  monthly: 30,
  yearly: 365,
}

export async function plansSubscribeFactory(preHook?: UserPreHook) {
  const fastify = Fastify().withTypeProvider<ZodTypeProvider>()

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
        },
      },
    },
    async (request, reply) => {
      const { planId } = request.body as { planId: string }
      const userId = (request as any).user?.sub || 'anonymous'
      const now = new Date().toISOString()

      const plans = await scan<any>(TABLES.PLANS)
      const plan = plans.find((p) => p.id === planId)

      if (!plan) {
        return reply.code(404).send({
          success: false,
          error: 'Plan not found',
        })
      }

      const days = INTERVAL_DAYS[plan.interval as string] ?? 30
      const currentPeriodEnd = new Date(
        Date.now() + days * 24 * 60 * 60 * 1000
      ).toISOString()

      const subscriptions = await scan<any>(TABLES.SUBSCRIPTIONS)
      const existing = subscriptions.find((s) => s.userId === userId)

      if (existing) {
        await update(
          TABLES.SUBSCRIPTIONS,
          { userId },
          {
            planId,
            status: 'active',
            startedAt: existing.startedAt || now,
            currentPeriodEnd,
            updatedAt: now,
          }
        )
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

export type { plansSubscribeFactory }