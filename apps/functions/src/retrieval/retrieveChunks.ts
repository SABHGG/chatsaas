import { RetrievalError, type RetrievedChunk } from './types.js'
import type { NeonQueryFn } from '../ingest/persistEmbeddings.js'

/**
 * Multi-tenant pgvector retrieval over the direct Neon HTTP driver
 * (ADR-008 — the same connection stack as WI-005 ingest, replacing the
 * retired Aurora RDS Data API path).
 *
 * R-1 (CRITICAL): the query filters are built ONLY from the chatbot row
 * values (`chatbotId` + `companyId` resolved by `resolveChatbotScope`).
 * Nothing from the request body/query string ever reaches this SQL.
 *
 * The `NeonQueryFn` is injectable for tests; production callers pass
 * `neonQueryFn(await resolveNeonUrl(...))` (see
 * api/chatPublicMessage.ts). Parameters are positional ($n) because the
 * Neon HTTP driver has no named-parameter support.
 */
export interface RetrieveChunksInput {
  /** Executable Neon query fn (pooled connection string resolved upstream). */
  query: NeonQueryFn
  /** Trusted scope: chatbot row's `id`. */
  chatbotId: string
  /** Trusted scope: chatbot row's `companyId`. NEVER a request field. */
  companyId: string
  /** Question embedding from `embedQuestion` (Titan v2, 1024 dims). */
  embedding: number[]
  topK: number
}

interface RetrievalRow {
  id?: unknown
  content?: unknown
  score?: unknown
}

export async function retrieveChunks(
  input: RetrieveChunksInput,
): Promise<RetrievedChunk[]> {
  const sql = `
    SELECT id, content, embedding <=> $1::vector AS score
    FROM public.embeddings
    WHERE chatbot_id = $2::uuid AND company_id = $3::uuid
    ORDER BY embedding <=> $1::vector
    LIMIT $4;
  `
  let rows: unknown
  try {
    rows = await input.query(sql, [
      `[${input.embedding.join(',')}]`,
      input.chatbotId,
      input.companyId,
      input.topK,
    ])
  } catch (err) {
    throw new RetrievalError('db_error', `Retrieval query failed: ${(err as Error).message}`)
  }

  const records = (Array.isArray(rows) ? rows : []) as RetrievalRow[]
  return records.map((rec) => {
    const id = rec.id
    const content = rec.content
    const score = rec.score
    if (id === undefined || id === null || content === undefined || content === null) {
      throw new RetrievalError('db_error', 'Retrieval row missing id/content columns')
    }
    return { id: String(id), content: String(content), score: Number(score ?? 0) }
  })
}
