-- Root Cause: similarity matching over stored failure signatures.
-- Run this in the Supabase SQL editor.
--
-- Mirrors match_prompts / match_memories: cosine similarity over the shared
-- resources.embedding column, scoped to a user and to type = 'root_cause'.
-- The embedding is of the failure_signature.description — the normalized,
-- bucketed encoding of the data pattern that preceded the failure — so two
-- failures match when their surrounding-data shapes are similar, not when their
-- surface descriptions happen to share words.

CREATE OR REPLACE FUNCTION match_failure_signatures(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  title text,
  payload jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.id,
    r.title,
    r.payload,
    r.created_at,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM resources r
  WHERE r.user_id = p_user_id
    AND r.type = 'root_cause'
    AND r.embedding IS NOT NULL
    AND 1 - (r.embedding <=> query_embedding) > match_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;
