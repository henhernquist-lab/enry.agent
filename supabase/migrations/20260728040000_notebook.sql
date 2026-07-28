-- Migration 20260728040000_notebook
-- Purpose: Migrate single-scratchpad quick_notes into the multi-note notebook model.
--          Quick Notes Widget becomes a capture scratchpad; the /notes page becomes
--          a real notebook with create/edit/delete per note.
--
-- APPLY: Review, then run against your Supabase instance. Do NOT auto-apply.

-- Step 1: Migrate existing quick_note scratchpad content into the `note` type.
--          For each user who has a quick_note, create a note resource from it.
--          Keep the original quick_note row intact (safe migration — delete later if desired).
INSERT INTO resources (user_id, type, source, title, payload, created_at, updated_at)
SELECT
  user_id,
  'note',
  'user',
  COALESCE(
    NULLIF(regexp_replace(payload->>'content', '\n.*', ''), ''),
    'Quick note'
  ),
  jsonb_build_object('content', payload->>'content'),
  created_at,
  updated_at
FROM resources
WHERE type = 'quick_note'
  AND payload->>'content' IS NOT NULL
  AND payload->>'content' != ''
  AND NOT EXISTS (
    -- Don't duplicate if a note with identical content already exists for this user
    SELECT 1 FROM resources r2
    WHERE r2.type = 'note'
      AND r2.user_id = resources.user_id
      AND r2.payload->>'content' = resources.payload->>'content'
  );

-- Step 2: Add an index to speed up note listing by user (created_at DESC)
CREATE INDEX IF NOT EXISTS idx_resources_note_user_created
  ON resources (user_id, created_at DESC)
  WHERE type = 'note';
