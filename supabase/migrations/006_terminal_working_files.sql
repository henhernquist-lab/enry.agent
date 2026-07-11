-- Live Terminal write mode: durable working-copy storage.
-- Run this in the Supabase SQL editor.
--
-- The tarball snapshot on disk (src/lib/terminal/snapshot.ts) is per-instance
-- scratch space — it does not survive between Vercel serverless invocations.
-- This table is the actual source of truth for anything `apply`d but not yet
-- `commit`ted: one row per (session, file). Read commands re-materialize
-- these rows onto the local snapshot at the start of every request; `commit`
-- reads all rows for a session, bundles them into one real GitHub commit via
-- the Git Data API, then deletes them.

CREATE TABLE IF NOT EXISTS terminal_working_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  content text NOT NULL,
  -- The sha this content was generated FROM: the real GitHub blob sha for a
  -- file's first edit in a session, or a sha256 of the prior working-copy
  -- content for a stacked edit (edit -> apply -> edit again, same session).
  -- Used to detect a stale diff before the next apply overwrites anything.
  base_sha text NOT NULL,
  is_new_file boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_terminal_working_files_session
  ON terminal_working_files (session_id);

-- Row-level security: service role (used by all server routes) bypasses RLS
-- by default, same pattern as every other table in this app.
ALTER TABLE terminal_working_files ENABLE ROW LEVEL SECURITY;
