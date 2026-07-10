-- Migration: profiles table
-- The profiles table stores user identity, auth, and onboarding profile_data.
-- google_id stores the provider account ID (Google sub, github_XXX, cred_<uuid>).
--
-- This migration is safe for environments where the table already exists:
-- it creates the table if missing, and ensures the UNIQUE constraint on google_id.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    CREATE TABLE public.profiles (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      google_id     TEXT NOT NULL,
      email         TEXT,
      name          TEXT,
      avatar_url    TEXT,
      password_hash TEXT,
      profile_data  JSONB DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ DEFAULT now(),
      updated_at    TIMESTAMPTZ DEFAULT now()
    );

    CREATE UNIQUE INDEX idx_profiles_google_id ON public.profiles (google_id);
    CREATE INDEX idx_profiles_email ON public.profiles (email);

    -- Enable RLS but service_role bypasses it (all writes use SUPABASE_SERVICE_ROLE_KEY)
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ELSE
    -- Ensure unique constraint on google_id exists (may be missing on manual-created tables).
    -- NOTE: This will fail if duplicate google_id rows already exist — that is intentional,
    -- as the application relies on one profile row per identity. Clean up duplicates before running.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'profiles_google_id_key'
        AND conrelid = 'public.profiles'::regclass
    ) THEN
      ALTER TABLE public.profiles ADD CONSTRAINT profiles_google_id_key UNIQUE (google_id);
    END IF;
  END IF;
END $$;
