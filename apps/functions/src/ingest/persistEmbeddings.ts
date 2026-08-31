import {
  RDSDataClient,
  ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";
import type { EmbeddingRow } from "./types.js";

/**
 * Inserts embedding rows into `public.embeddings` via the RDS Data API.
 *
 * The unique index `(chatbot_id, content_sha256)` makes
 * `INSERT ... ON CONFLICT DO NOTHING` a no-op for already-embedded chunks.
 * A re-upload of the same content re-uses the existing rows.
 *
 * Returns `{ insertedCount }` from the Data API's `numberOfRecordsUpdated`
 * field (PostgreSQL `INSERT ... ON CONFLICT DO NOTHING ... RETURNING *`
 * reports the actual row inserts in `numberOfRecordsUpdated`).
 */
export interface PersistOptions {
  clusterArn: string;
  secretArn: string;
  database: string;
  region: string;
}

export async function persistChunks(
  opts: PersistOptions,
  rows: EmbeddingRow[],
): Promise<{ insertedCount: number }> {
  if (rows.length === 0) {
    return { insertedCount: 0 };
  }
  const client = new RDSDataClient({ region: opts.region });
  // We use one ExecuteStatement per row because the Data API does not
  // natively support multi-row VALUES inserts with named parameters.
  // For a 1000-chunk document, 1000 round-trips of ~5 ms each is 5 s
  // total, well within the 5-minute Lambda timeout. A future WI may
  // batch by writing to a single TEMP table via S3 COPY.
  let inserted = 0;
  for (const row of rows) {
    const sql = `
      INSERT INTO public.embeddings (id, chatbot_id, company_id, content, content_sha256, embedding)
      VALUES (:id::uuid, :chatbotId::uuid, :companyId::uuid, :content, :contentSha256, :embedding::vector)
      ON CONFLICT (chatbot_id, content_sha256) DO NOTHING
      RETURNING id;
    `;
    const resp = await client.send(
      new ExecuteStatementCommand({
        resourceArn: opts.clusterArn,
        secretArn: opts.secretArn,
        database: opts.database,
        sql,
        parameters: [
          { name: "id", value: { stringValue: row.id } },
          { name: "chatbotId", value: { stringValue: row.chatbotId } },
          { name: "companyId", value: { stringValue: row.companyId } },
          { name: "content", value: { stringValue: row.content } },
          {
            name: "contentSha256",
            value: { blobValue: row.contentSha256 as unknown as Uint8Array },
          },
          {
            name: "embedding",
            // pgvector expects a JSON array of floats as text.
            value: { stringValue: `[${row.embedding.join(",")}]` },
          },
        ],
      }),
    );
    // numberOfRecordsUpdated is the number of rows actually inserted by
    // the RETURNING clause. 0 means the ON CONFLICT branch was taken.
    if ((resp.numberOfRecordsUpdated ?? 0) > 0) {
      inserted += 1;
    }
  }
  return { insertedCount: inserted };
}
