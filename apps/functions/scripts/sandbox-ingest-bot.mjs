/**
 * Manual ingest trigger for the local sandbox — EVERY uploaded document.
 *
 * In production the ingest runs as a Lambda behind EventBridge on every
 * `s3:ObjectCreated:Put` against the documents bucket. The floci sandbox does
 * not wire that event pipeline, so documents uploaded through the API stay
 * `uploaded` forever. Where `scripts/sandbox-ingest.mjs` re-ingests a single
 * document by id, this variant sweeps the documents table for EVERY document
 * with status `uploaded` (optionally narrowed to one chatbot) and runs the
 * REAL ingest handler against the local stack: floci DynamoDB + S3, the
 * deterministic Bedrock mock and floci rds-data pgvector.
 *
 * Usage (from apps/functions):
 *   pnpm exec tsx --env-file-if-exists=.env scripts/sandbox-ingest-bot.mjs [chatbotId]
 *
 * Idempotent-ish: re-running a ready document is excluded by the status
 * scan itself (only `uploaded` is swept); a document already in
 * `processing` is skipped the same way, and re-chunking re-embeds and hits
 * the unique (chatbot_id, content_sha256) index with ON CONFLICT DO NOTHING.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../src/ingest/handler.js";

// Self-load apps/functions/.env when present. tsx does not honor node's
// --env-file flags (they are node CLI options, silently dropped by the tsx
// CLI), so the sandbox scripts load it themselves. Existing env wins.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const envPath = new URL("../.env", import.meta.url);
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // No .env: rely on the exported environment (e.g. `eval $(floci env)`).
}

const chatbotId = process.argv[2] ?? null;
if (process.argv.length > 3) {
  console.error(
    "usage: pnpm exec tsx --env-file-if-exists=.env scripts/sandbox-ingest-bot.mjs [chatbotId]",
  );
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const table = process.env.DOCUMENTS_TABLE;
const documents = [];
let exclusiveStartKey;
do {
  const out = await ddb.send(
    new ScanCommand({
      TableName: table,
      FilterExpression: chatbotId
        ? "#status = :uploaded AND chatbotId = :chatbotId"
        : "#status = :uploaded",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: chatbotId
        ? { ":uploaded": "uploaded", ":chatbotId": chatbotId }
        : { ":uploaded": "uploaded" },
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  documents.push(...(out.Items ?? []));
  exclusiveStartKey = out.LastEvaluatedKey;
} while (exclusiveStartKey);

if (documents.length === 0) {
  console.error(
    `no documents with status "uploaded"${chatbotId ? ` for chatbot ${chatbotId}` : ""} in table ${table} — nothing to do`,
  );
  process.exit(0);
}

let ok = 0;
let failed = 0;
for (const doc of documents) {
  const event = {
    Records: [
      {
        s3: {
          bucket: { name: process.env.DOCUMENTS_BUCKET },
          object: { key: doc.s3Key },
        },
      },
    ],
  };

  console.log(`ingesting document ${doc.id} (key: ${doc.s3Key})`);
  try {
    await handler(event);
    ok += 1;
  } catch (err) {
    // One poisoned document (e.g. a legacy row whose company_id is not a
    // UUID, rejected by pgvector) must not abort the sweep: the handler has
    // already marked it `failed` in DynamoDB. Keep going.
    failed += 1;
    console.error(
      `ingest FAILED for ${doc.id}: ${(err).message?.split("\n")[0] ?? err}`,
    );
  }
}

console.log(
  `ingest finished: ${ok} ready, ${failed} failed, of ${documents.length} document(s)`,
);
if (ok === 0 && failed > 0) process.exit(1);
