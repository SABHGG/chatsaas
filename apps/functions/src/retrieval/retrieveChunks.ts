import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { RetrievalError, type RetrievedChunk } from './types.js'

/**
 * Multi-tenant pgvector retrieval through the RDS Data API (same connection
 * stack as WI-005 ingest — DC-005-5: RDS Data API for v1).
 *
 * R-1 (CRITICAL): the query filters are built ONLY from the chatbot row
 * values (`chatbotId` + `companyId` resolved by `resolveChatbotScope`).
 * Nothing from the request body/query string ever reaches this SQL.
 */
export interface RetrieveChunksInput {
  clusterArn: string
  secretArn: string
  database: string
  region: string
  /** Trusted scope: chatbot row's `id`. */
  chatbotId: string
  /** Trusted scope: chatbot row's `companyId`. NEVER a request field. */
  companyId: string
  /** Question embedding from `embedQuestion` (Titan v2, 1024 dims). */
  embedding: number[]
  topK: number
}

export async function retrieveChunks(
  input: RetrieveChunksInput,
  rds?: RDSDataClient,
): Promise<RetrievedChunk[]> {
  const client = rds ?? new RDSDataClient({ region: input.region })
  const sql = `
    SELECT id, content, embedding <=> :embedding::vector AS score
    FROM public.embeddings
    WHERE chatbot_id = :chatbotId::uuid AND company_id = :companyId::uuid
    ORDER BY embedding <=> :embedding::vector
    LIMIT :topK;
  `
  let resp
  try {
    resp = await client.send(
      new ExecuteStatementCommand({
        resourceArn: input.clusterArn,
        secretArn: input.secretArn,
        database: input.database,
        sql,
        parameters: [
          { name: 'chatbotId', value: { stringValue: input.chatbotId } },
          { name: 'companyId', value: { stringValue: input.companyId } },
          { name: 'embedding', value: { stringValue: `[${input.embedding.join(',')}]` } },
          { name: 'topK', value: { longValue: input.topK } },
        ],
      }),
    )
  } catch (err) {
    throw new RetrievalError('db_error', `Retrieval query failed: ${(err as Error).message}`)
  }

  const records = resp.records ?? []
  return records.map((rec) => {
    const id = rec[0]?.stringValue
    const content = rec[1]?.stringValue
    const scoreField = rec[2]
    const score =
      scoreField?.stringValue !== undefined
        ? Number(scoreField.stringValue)
        : (scoreField?.doubleValue ?? 0)
    if (id === undefined || content === undefined) {
      throw new RetrievalError('db_error', 'Retrieval row missing id/content columns')
    }
    return { id, content, score }
  })
}
