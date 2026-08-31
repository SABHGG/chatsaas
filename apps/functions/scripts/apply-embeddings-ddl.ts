/**
 * One-shot script: applies the embeddings table DDL to the database reachable
 * through the RDS Data API endpoint in the environment (floci emulation in
 * local sandbox, real Aurora in deployment).
 *
 * Sources of truth for the SQL: infra/lib/embeddings-table-resource.ts
 * (EMBEDDINGS_TABLE_SQL) and infra/lib/ingest-embeddings-index.ts
 * (EMBEDDINGS_UNIQUE_INDEX_SQL). They are inlined here to avoid pulling the CDK
 * dependency graph into apps/functions; keep them in sync.
 *
 * Run (from apps/functions, with .env loaded):
 *   pnpm exec tsx scripts/apply-embeddings-ddl.ts
 */
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'

const SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL,
  company_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS embeddings_chatbot_company_idx
  ON public.embeddings (chatbot_id, company_id);

CREATE INDEX IF NOT EXISTS embeddings_embedding_hnsw_idx
  ON public.embeddings USING hnsw (embedding vector_cosine_ops);

ALTER TABLE IF EXISTS public.embeddings ADD COLUMN IF NOT EXISTS content_sha256 BYTEA;

CREATE UNIQUE INDEX IF NOT EXISTS embeddings_chatbot_content_sha256_idx
  ON public.embeddings (chatbot_id, content_sha256);

ANALYZE public.embeddings;
`

async function main(): Promise<void> {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1'
  const clusterArn = process.env.RDS_CLUSTER_ARN
  const secretArn = process.env.RDS_SECRET_ARN
  const database = process.env.RDS_DATABASE

  if (!clusterArn || !secretArn || !database) {
    throw new Error('Missing RDS_CLUSTER_ARN / RDS_SECRET_ARN / RDS_DATABASE in environment')
  }

  const client = new RDSDataClient({ region })
  const statements = SQL.split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const sql of statements) {
    const label = sql.split('\n')[0].slice(0, 60)
    try {
      await client.send(
        new ExecuteStatementCommand({ resourceArn: clusterArn, secretArn, database, sql }),
      )
      console.log(`ok: ${label}`)
    } catch (err) {
      console.error(`FAILED: ${label}`)
      throw err
    }
  }
  console.log('embeddings table ready')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
