/**
 * WI-004: run the pgvector migration (infra/db/migrations) against the Neon
 * dev project using the @neondatabase/serverless HTTP driver — the same
 * connection path the ingest Lambda uses at runtime (ADR-008).
 *
 * Usage:
 *   pnpm --filter @chatsaas/functions exec node --env-file-if-exists=.env \
 *     scripts/run-neon-migration.mjs [infra/db/migrations/001-embeddings-pgvector.sql]
 *
 * Env: NEON_DATABASE_URL — the pooled (-pooler) Neon connection string.
 * Statements are split on ';' and executed sequentially; every statement in
 * the migration file is idempotent, so the script is safe to re-run.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const file =
  process.argv[2] ?? `${root}/infra/db/migrations/001-embeddings-pgvector.sql`;

const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error("Missing NEON_DATABASE_URL in environment");
  process.exit(1);
}

const sql = readFileSync(file, "utf-8");
const statements = sql
  .split(";")
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

console.log(`Applying ${file} (${statements.length} statements)…`);
const db = neon(url);
for (const statement of statements) {
  const firstLine = statement.split("\n").find((l) => !l.startsWith("--"));
  await db.query(statement);
  console.log(`  ok: ${firstLine?.slice(0, 72) ?? "<statement>"}`);
}

// Verification: extension, table, and indexes.
const checks = [
  ["extension", `SELECT extname FROM pg_extension WHERE extname = 'vector'`],
  ["table", `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'embeddings'`],
  ["indexes", `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'embeddings' ORDER BY indexname`],
];
for (const [label, query] of checks) {
  const rows = await db.query(query);
  console.log(`${label}: ${JSON.stringify(rows.map((r) => Object.values(r)[0]))}`);
}
console.log("Migration applied.");
