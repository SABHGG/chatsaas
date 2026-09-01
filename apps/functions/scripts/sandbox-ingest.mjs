/**
 * Manual ingest trigger for the local sandbox.
 *
 * In production the ingest runs as a Lambda behind EventBridge on every
 * `s3:ObjectCreated:Put` against the documents bucket. The floci sandbox does
 * not wire that event pipeline, so documents uploaded through the API stay
 * `uploaded` forever. This script builds the exact same S3 event for one
 * document (by id) and runs the REAL ingest handler against the local stack:
 * floci DynamoDB + S3, the deterministic Bedrock mock and floci rds-data
 * pgvector.
 *
 * Usage (from anywhere):
 *   pnpm dev:ingest-doc <documentId>
 *
 * Idempotent-ish: re-running a ready document is a no-op of the status guard
 * (uploaded|processing -> processing), but re-chunking re-embeds and hits the
 * unique (chatbot_id, content_sha256) index with ON CONFLICT DO NOTHING.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
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

const documentId = process.argv[2];
if (!documentId) {
  console.error(
    "usage: pnpm exec tsx --env-file-if-exists=.env scripts/sandbox-ingest.mjs <documentId>",
  );
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const table = process.env.DOCUMENTS_TABLE;
const out = await ddb.send(new GetCommand({ TableName: table, Key: { id: documentId } }));
const doc = out.Item;
if (!doc) {
  console.error(`document ${documentId} not found in table ${table}`);
  process.exit(1);
}

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

console.log(`ingesting document ${documentId} (key: ${doc.s3Key})`);
await handler(event);
console.log(`ingest finished for ${documentId} — status should now be "ready"`);
