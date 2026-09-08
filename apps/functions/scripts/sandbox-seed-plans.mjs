/**
 * Sandbox seed: inserts the two reference plans into the local Floci AWS
 * emulator's `plans` table so the wizard review step (GET /plans/available)
 * has something to render.
 *
 * Usage:  eval $(floci env) && node scripts/sandbox-seed-plans.mjs
 *         (from apps/functions; the table must already exist —
 *         scripts/sandbox-setup.mjs creates it)
 * Idempotent: existing plan ids are overwritten (same ids, same shape as the
 * WI-002 test fixtures).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
} from '@aws-sdk/lib-dynamodb'

const TABLE = process.env.PLANS_TABLE_NAME ?? 'plans'

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' })
)

const PLANS = [
  {
    id: 'plan-1',
    name: 'Basic',
    description: 'Basic plan',
    price: 9.99,
    interval: 'monthly',
    active: true,
  },
  {
    id: 'plan-2',
    name: 'Pro',
    description: 'Pro plan',
    price: 19.99,
    interval: 'monthly',
    active: true,
  },
]

async function main() {
  for (const plan of PLANS) {
    await ddb.send(
      new PutCommand({ TableName: TABLE, Item: plan })
    )
    console.log(`+ plan seeded: ${plan.id} (${plan.name}, $${plan.price}/${plan.interval})`)
  }
}

main().catch((err) => {
  console.error('sandbox plan seed failed:', err)
  process.exit(1)
})
