-- Enry Learn — Feature columns + match_claims RPC.
-- Built on top of 019_learn_claims.sql (the base claims/claim_events schema).
-- Each feature added here is a column or an RPC; claim_events carries the event log.
-- See LEARN.md for the full contract.

-- ── Enemy Claims ──────────────────────────────────────────────────────────
-- is_enemy: the user marks this claim as something they believe is FALSE,
-- a "ringer" blended into regular probes without special labeling. The probe
-- rotation mixes enemies in silently — the user doesn't know which claims are
-- enemies until they answer. If they correctly identify it as false,
-- enemy_caught_at is set and the claim retires. If they defend it as true,
-- that failure is logged as a claim_event of type 'enemy_defended'.
ALTER TABLE claims ADD COLUMN IF NOT EXISTS is_enemy boolean NOT NULL DEFAULT false;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS enemy_caught_at timestamptz;

-- Partial index for "which enemies are still active?" — the tab's main query.
CREATE INDEX IF NOT EXISTS idx_claims_enemy_active
  ON claims (user_id, created_at)
  WHERE is_enemy = true AND enemy_caught_at IS NULL;

-- ── match_claims RPC — semantic similarity search ────────────────────────
-- Mirrors match_memories from 001_memories_table.sql. Same vector(1024),
-- same cosine similarity (<=> operator), same RPC shape. Used by Receipts
-- for contradiction detection and by any future feature that needs to find
-- claims near a given embedding.
CREATE OR REPLACE FUNCTION match_claims(
  query_embedding vector(1024),
  match_user_id uuid,
  match_count int
)
RETURNS TABLE(id uuid, content text, similarity float, is_enemy boolean, status text)
LANGUAGE sql
AS $$
  SELECT id, content, 1 - (embedding <=> query_embedding) as similarity,
         is_enemy, status
  FROM claims
  WHERE user_id = match_user_id
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
