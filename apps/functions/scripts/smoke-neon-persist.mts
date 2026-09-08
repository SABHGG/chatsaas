/**
 * WI-004 DB smoke (run-once, not committed): exercise the REAL persistChunks
 * data plane (batched INSERT ... ON CONFLICT DO NOTHING RETURNING) against the
 * real Neon dev project, then verify the conflict behaviour and clean up.
 *
 * Usage: node --env-file=.env ./scripts/smoke-neon-persist.mts
 */
import { randomUUID, createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { persistChunks, neonQueryFn } from "../src/ingest/persistEmbeddings.js";

const neonUrl = process.env.NEON_DATABASE_URL;
if (!neonUrl) throw new Error("NEON_DATABASE_URL is not set (apps/functions/.env)");

const chatbotId = randomUUID();
const companyId = randomUUID();
const embedding = Array.from({ length: 1024 }, () => 0.0);
const rows = [
  {
    chatbotId,
    companyId,
    content: "WI-004 smoke test chunk",
    contentSha256: createHash("sha256").update("WI-004 smoke test chunk").digest(),
    embedding,
  },
  {
    chatbotId,
    companyId,
    content: "WI-004 smoke test chunk two",
    contentSha256: createHash("sha256").update("WI-004 smoke test chunk two").digest(),
    embedding,
  },
];

const opts = { neonUrl };
const first = await persistChunks(opts, rows);
console.log("first insert insertedCount:", first.insertedCount);
if (first.insertedCount !== 2) throw new Error(`expected 2, got ${first.insertedCount}`);

const again = await persistChunks(opts, rows);
console.log("re-insert insertedCount:", again.insertedCount);
if (again.insertedCount !== 0) throw new Error(`expected 0 on conflict, got ${again.insertedCount}`);

const query = neonQueryFn(neonUrl);
const countAfterInsert = (await query(
  "SELECT count(*)::int AS n FROM public.embeddings WHERE chatbot_id = $1::uuid",
  [chatbotId],
) as unknown as { n: number }[])[0].n;
console.log("rows present:", countAfterInsert);

await query("DELETE FROM public.embeddings WHERE chatbot_id = $1::uuid", [chatbotId]);
const rowsAfterCleanup = (await query(
  "SELECT count(*)::int AS n FROM public.embeddings WHERE chatbot_id = $1::uuid",
  [chatbotId],
) as unknown as { n: number }[])[0].n;
console.log("rows after cleanup:", rowsAfterCleanup);
console.log("SMOKE OK");
