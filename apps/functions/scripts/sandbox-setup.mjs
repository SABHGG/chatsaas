/**
 * Sandbox bootstrap: creates the DynamoDB tables and S3 bucket the backend
 * expects, inside the local Floci AWS emulator (http://localhost:4566).
 *
 * Usage:  eval $(floci env) && node scripts/sandbox-setup.mjs
 * Idempotent: existing tables/buckets are skipped.
 */
import {
  CreateTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb'
import {
  CreateBucketCommand,
  ListBucketsCommand,
  S3Client,
} from '@aws-sdk/client-s3'

const ddb = new DynamoDBClient({ region: 'us-east-1' })
const s3 = new S3Client({ region: 'us-east-1' })

const TABLES = [
  // Admin surface (src/db/schema.ts)
  { name: 'chat-messages', hash: 'userId', range: 'createdAt' },
  { name: 'credits', hash: 'userId' },
  { name: 'plans', hash: 'id' },
  { name: 'subscriptions', hash: 'userId', range: 'planId' },
  { name: 'content', hash: 'id' },
  // WI-001/WI-005 chatbot + document routes
  { name: 'chatbots', hash: 'id' },
  { name: 'documents', hash: 'id' },
  // WI-006 public chat route (separate env-driven tables)
  { name: 'wi006-conversations', hash: 'id' },
  { name: 'wi006-messages', hash: 'conversationId', range: 'createdAt' },
  { name: 'wi006-subscriptions', hash: 'id' },
  { name: 'wi006-credits', hash: 'id' },
]

const BUCKET = 'chatsaas-sandbox-documents'

async function main() {
  const existing = new Set(
    (await ddb.send(new ListTablesCommand({}))).TableNames ?? []
  )
  for (const t of TABLES) {
    if (existing.has(t.name)) {
      console.log(`= table exists: ${t.name}`)
      continue
    }
    const keySchema = [{ AttributeName: t.hash, KeyType: 'HASH' }]
    const attributeDefinitions = [
      { AttributeName: t.hash, AttributeType: 'S' },
    ]
    if (t.range) {
      keySchema.push({ AttributeName: t.range, KeyType: 'RANGE' })
      attributeDefinitions.push({ AttributeName: t.range, AttributeType: 'S' })
    }
    await ddb.send(
      new CreateTableCommand({
        TableName: t.name,
        KeySchema: keySchema,
        AttributeDefinitions: attributeDefinitions,
        BillingMode: 'PAY_PER_REQUEST',
      })
    )
    console.log(`+ table created: ${t.name}`)
  }

  const buckets = new Set(
    ((await s3.send(new ListBucketsCommand({}))).Buckets ?? []).map(
      (b) => b.Name
    )
  )
  if (buckets.has(BUCKET)) {
    console.log(`= bucket exists: ${BUCKET}`)
  } else {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
    console.log(`+ bucket created: ${BUCKET}`)
  }
}

main().catch((err) => {
  console.error('sandbox setup failed:', err)
  process.exit(1)
})
