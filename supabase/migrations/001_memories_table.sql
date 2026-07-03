-- Memories table with pgvector for semantic search
-- Run this in the Supabase SQL editor

-- Enable the vector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the memories table
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id text NOT NULL,
  content text NOT NULL,
  embedding vector(1024),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for filtering by user
CREATE INDEX IF NOT EXISTS idx_memories_google_id ON memories (google_id);

-- If the table already exists with a different embedding dimension, alter it:
-- ALTER TABLE memories ALTER COLUMN embedding TYPE vector(1024);

-- Cosine similarity search function
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1024),
  match_google_id text,
  match_count int
)
RETURNS TABLE(id uuid, content text, similarity float)
LANGUAGE sql
AS $$
  SELECT id, content, 1 - (embedding <=> query_embedding) as similarity
  FROM memories
  WHERE google_id = match_google_id
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Row-level security: users can only access their own memories
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by the server with SUPABASE_SERVICE_ROLE_KEY)
-- No policy needed for service role — it bypasses RLS by default.
