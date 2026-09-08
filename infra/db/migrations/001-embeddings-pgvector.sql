-- WI-004 / ADR-008: embeddings schema for the Neon vector store (pgvector).
--
-- Ported from the Aurora-era custom resources (deleted in this WI):
--   - infra/lib/embeddings-table-resource.ts (EMBEDDINGS_TABLE_SQL)
--   - infra/lib/ingest-embeddings-index.ts   (EMBEDDINGS_UNIQUE_INDEX_SQL)
--
-- Run against the Neon `main` branch (see infra/README.md for the runbook).
-- Every statement is idempotent, so the script is safe to re-run.

-- Enable pgvector (Neon has it preinstalled; this is a no-op on re-run).
CREATE EXTENSION IF NOT EXISTS vector;

-- public.embeddings — one row per embedded chunk.
CREATE TABLE IF NOT EXISTS public.embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL,
  company_id UUID NOT NULL,
  content TEXT NOT NULL,
  content_sha256 BYTEA,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard for tables created before content_sha256 existed (Aurora-era custom
-- resource path); a no-op when the column is already declared above.
ALTER TABLE IF EXISTS public.embeddings
  ADD COLUMN IF NOT EXISTS content_sha256 BYTEA;

-- Composite B-tree for the tenant predicate (chatbot_id, company_id).
CREATE INDEX IF NOT EXISTS embeddings_chatbot_company_idx
  ON public.embeddings (chatbot_id, company_id);

-- HNSW index for cosine-distance retrieval (<=> operator).
CREATE INDEX IF NOT EXISTS embeddings_embedding_hnsw_idx
  ON public.embeddings USING hnsw (embedding vector_cosine_ops);

-- Unique per (chatbot_id, content_sha256): makes the ingest Lambda's
-- INSERT ... ON CONFLICT (chatbot_id, content_sha256) DO NOTHING a true
-- no-op for re-embedded chunks.
CREATE UNIQUE INDEX IF NOT EXISTS embeddings_chatbot_content_sha256_idx
  ON public.embeddings (chatbot_id, content_sha256);

-- Refresh planner statistics so the HNSW / unique indexes are picked up
-- from the first query.
ANALYZE public.embeddings;
