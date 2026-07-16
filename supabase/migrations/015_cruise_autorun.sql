-- Enry Cruise: scheduled auto-scan-and-fix (Phase 4). Per-repo opt-in "Auto-run"
-- fires a deterministic scanfix run on a local-time schedule, fully autonomous.
-- Builds on 014_cruise_goal_run_snapshot.sql (cruise_goal_runs.trigger already
-- exists). Additive/idempotent, same as 010-014. Run this in the Supabase SQL
-- editor.

-- Durable GitHub OAuth token for headless (session-less) dispatch from the cron
-- tick. The session JWT holds it too, but a cron has no session; persisted here
-- on every GitHub sign-in. OAuth-App tokens don't expire, so this stays valid.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS github_token text;

-- Per-repo Auto-run config. Off by default; opt-in per repo. The schedule is
-- stored in the user's LOCAL time + IANA zone and evaluated in that zone each
-- tick (never a precomputed UTC instant), which is what keeps it DST-safe.
ALTER TABLE cruise_repos
  ADD COLUMN IF NOT EXISTS auto_run_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_run_time text,                         -- "HH:MM" 24h local
  ADD COLUMN IF NOT EXISTS auto_run_tz text,                           -- IANA, e.g. America/New_York
  ADD COLUMN IF NOT EXISTS auto_run_frequency text
    CHECK (auto_run_frequency IN ('daily','weekly','every_n_days')),
  ADD COLUMN IF NOT EXISTS auto_run_weekday int,                       -- 0=Sun..6=Sat (weekly)
  ADD COLUMN IF NOT EXISTS auto_run_interval_days int,                 -- N (every_n_days)
  ADD COLUMN IF NOT EXISTS auto_run_anchor_date text,                  -- YYYY-MM-DD local (every_n_days counting)
  ADD COLUMN IF NOT EXISTS auto_run_categories jsonb NOT NULL DEFAULT '[]'::jsonb, -- category keys allowed to auto-fix on schedule
  ADD COLUMN IF NOT EXISTS auto_run_last_fired_local_date text,        -- YYYY-MM-DD local; dedup guard
  ADD COLUMN IF NOT EXISTS auto_run_monthly_cap int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS auto_run_month text,                        -- YYYY-MM local of the current count
  ADD COLUMN IF NOT EXISTS auto_run_month_count int NOT NULL DEFAULT 0;

-- The tick scans this set every ~15 min; keep it cheap.
CREATE INDEX IF NOT EXISTS idx_cruise_repos_autorun
  ON cruise_repos (auto_run_enabled) WHERE auto_run_enabled;
