-- Migration: link a GitHub identity to an existing profile.
-- Run this in the Supabase SQL editor.
--
-- Problem this solves: GitHub sign-in previously tried to INSERT a new
-- profiles row keyed by google_id = 'github_<id>'. For a user whose GitHub
-- email already exists on another (Google) profile row, that INSERT violated
-- the hand-created unique-email constraint (profiles_email_key) — surfacing as
-- ?error=profile_create_failed. And even when it didn't collide, it produced a
-- SEPARATE empty profile disconnected from the user's real data.
--
-- Fix: one profile can now carry BOTH a Google identity (google_id) and a
-- linked GitHub identity (github_id). GitHub sign-in matches an existing
-- profile by github_id and reuses it, instead of inserting a new row.

-- 1. github_id column + partial unique index (many NULLs allowed; a given
--    GitHub account links to at most one profile).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS github_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_github_id
  ON public.profiles (github_id) WHERE github_id IS NOT NULL;

-- 2. Reconcile the migration/live-schema divergence: drop the hand-created
--    unique-email constraint that no migration created and that contradicts
--    the multi-provider design. Non-unique lookups on email still work via the
--    idx_profiles_email index from migration 005.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;

-- 3. One-time explicit link: attach GitHub account henhernquist-lab
--    (numeric id 280165074) to the apsk12.org profile that holds the real
--    data (50 resources). After this, GitHub sign-in resolves to this profile
--    instead of creating a new one.
UPDATE public.profiles
  SET github_id = '280165074'
  WHERE id = 'ed584571-8d0b-42fd-a871-cb7373638888';
