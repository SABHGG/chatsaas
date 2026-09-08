import { neon } from "@neondatabase/serverless";
import type { EmbeddingRow } from "./types.js";

/**
 * Inserts embedding rows into `public.embeddings` on Neon via the
 * `@neondatabase/serverless` HTTP driver (ADR-008: the pooled `-pooler`
 * endpoint + fetch-based queries; no VPC, no RDS Data API).
 *
 * The unique index `(chatbot_id, content_sha256)` makes
 * `INSERT ... ON CONFLICT DO NOTHING` a no-op for already-embedded chunks.
 * A re-upload of the same content re-uses the existing rows.
 *
 * Returns `{ insertedCount }` counted from the `RETURNING id` rows
 * (conflicted rows are skipped by Postgres and therefore not returned).
 */

/** Executable query fn over a Neon connection (injectable for tests). */
export type NeonQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<unknown[]>;

/** Production driver: the fetch-based HTTP query function. */
export function neonQueryFn(neonUrl: string): NeonQueryFn {
  const db = neon(neonUrl);
  return (text, params) => db.query(text, params as never[]);
}

export interface PersistOptions {
  /** Pooled (`-pooler`) Neon connection string. */
  neonUrl: string;
}

/** PostgreSQL binds at most 65535 parameters per statement; keep headroom. */
const MAX_ROWS_PER_INSERT = 500;

const INSERT_SQL_PREFIX = `
  INSERT INTO public.embeddings (chatbot_id, company_id, content, content_sha256, embedding)
  VALUES
`;
const INSERT_SQL_SUFFIX = `
  ON CONFLICT (chatbot_id, content_sha256) DO NOTHING
  RETURNING id;
`;

function toByteaHex(bytes: Uint8Array): string {
  return `\\x${Buffer.from(bytes).toString("hex")}`;
}

function toVectorLiteral(vector: number[]): string {
  // pgvector expects the vector literal as a JSON-like array of floats.
  return `[${vector.join(",")}]`;
}

export async function persistChunks(
  opts: PersistOptions,
  rows: EmbeddingRow[],
  query: NeonQueryFn = neonQueryFn(opts.neonUrl),
): Promise<{ insertedCount: number }> {
  if (rows.length === 0) {
    return { insertedCount: 0 };
  }

  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += MAX_ROWS_PER_INSERT) {
    const batch = rows.slice(offset, offset + MAX_ROWS_PER_INSERT);
    const params: unknown[] = [];
    const values = batch
      .map((row) => {
        const base = params.length;
        params.push(
          row.chatbotId,
          row.companyId,
          row.content,
          toByteaHex(row.contentSha256),
          toVectorLiteral(row.embedding),
        );
        // Per tuple: $1::uuid, $2::uuid, $3 text, $4::bytea, $5::vector.
        const placeholders = [1, 2, 3, 4, 5]
          .map((i) => `$${base + i}${i === 4 ? "::bytea" : i === 5 ? "::vector" : i <= 2 ? "::uuid" : ""}`)
          .join(", ");
        return `(${placeholders})`;
      })
      .join(", ");

    const result = (await query(
      `${INSERT_SQL_PREFIX} ${values} ${INSERT_SQL_SUFFIX}`,
      params,
    )) as { id: string }[];
    // Rows skipped by ON CONFLICT DO NOTHING are not RETURNING-ed, so the
    // result length is the number of rows actually inserted.
    inserted += result.length;
  }
  return { insertedCount: inserted };
}
