-- Semantic search RPCs for the Prompt Library and Article Notes.
-- Run this in the Supabase SQL editor.
--
-- These were referenced by /api/prompts/search, /api/article-notes/search and
-- /api/search/quick since those routes shipped, but never existed in the
-- database (PGRST202 at call time). The routes also never reached them in
-- practice because embedding generation was itself failing — both halves of
-- semantic search were broken independently.
--
-- Return shape mirrors what the routes' recency fallback selects, plus
-- similarity, so results are drop-in compatible with the Resource type.

CREATE OR REPLACE FUNCTION match_prompts(
  query_embedding vector(1024),
  match_user_id uuid,
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  type text,
  source text,
  title text,
  payload jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    r.id, r.type, r.source, r.title, r.payload, r.created_at, r.updated_at,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM resources r
  WHERE r.user_id = match_user_id
    AND r.type = 'prompt'
    AND r.embedding IS NOT NULL
    AND 1 - (r.embedding <=> query_embedding) > match_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION match_article_notes(
  query_embedding vector(1024),
  match_user_id uuid,
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  type text,
  source text,
  title text,
  payload jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    r.id, r.type, r.source, r.title, r.payload, r.created_at, r.updated_at,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM resources r
  WHERE r.user_id = match_user_id
    AND r.type = 'article_note'
    AND r.embedding IS NOT NULL
    AND 1 - (r.embedding <=> query_embedding) > match_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;
