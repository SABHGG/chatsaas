import Fastify from 'fastify'
import { ZodTypeProvider } from 'fastify-zod'
import { scan, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

export async function plansAvailableFactory(preHook?: UserPreHook) {
  const fastify = Fastify().withTypeProvider<ZodTypeProvider>()

  if (preHook) {
    fastify.addHook('onRequest', preHook)
  }

  // GET /api/plans/available - List available subscription plans
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Plans'],
        summary: 'List available subscription plans',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: 'string', nullable: true },
                    price: { type: 'number' },
                    interval: { type: 'string' },
                  },
                  required: ['id', 'name', 'price', 'interval'],
                  additionalProperties: false,
                },
              },
            },
            required: ['success', 'data'],
          },
        },
      },
    },
    async (request, reply) => {
      const items = await scan<any>(TABLES.PLANS)
      const activePlans = items.filter((item) => item.active === true)
      return { success: true, data: activePlans }
    }
  )

  return fastify
}

export type { plansAvailableFactory }