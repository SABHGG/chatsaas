import Fastify, { type FastifyPluginAsync } from 'fastify'
import { scan, TABLES } from '@/lib/db'
import type { UserPreHook } from './hooks'

interface PluginOpts {
  preHook: UserPreHook
}

/**
 * Fastify plugin for the admin `GET /api/plans/available` route.
 */
const plansAvailablePlugin: FastifyPluginAsync<PluginOpts> = async (
  fastify,
  opts
) => {
  fastify.addHook('onRequest', opts.preHook)

  // GET / - List available subscription plans
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
    async () => {
      const items = await scan<{ active?: boolean }>(TABLES.PLANS)
      const activePlans = items.filter((item) => item.active === true)
      return { success: true, data: activePlans }
    }
  )
}

export async function plansAvailableFactory(preHook: UserPreHook) {
  const fastify = Fastify()
  await fastify.register(plansAvailablePlugin, { preHook })
  return fastify
}

export { plansAvailablePlugin }
