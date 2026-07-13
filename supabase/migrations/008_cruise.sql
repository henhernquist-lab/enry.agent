-- Enry Cruise — Phase 1: allowlist + on-demand static-analysis scans, report-only.
-- Run this in the Supabase SQL editor.
--
-- Scope note: this migration only creates what Phase 1 uses. Fix/PR tables
-- (cruise_fixes) and budget/metering columns arrive in later phases as additive
-- migrations. Columns for config the allowlist UI already writes (fix_mode,
-- layers, trigger flags) are included now so the schema stays stable, even
-- though Phase 1 always uses fix_mode='report_only', layers=['static'], and
-- only the on-demand trigger.

-- ── Allowlist + per-repo config ──────────────────────────────────────────────
-- A repo NOT in this table (or enabled=false) can never be scanned. This is the
-- server-side gate enforced at dispatch time; the UI toggle is a mirror of it.
CREATE TABLE IF NOT EXISTS cruise_repos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name         text NOT NULL,                       -- "owner/name"
  enabled           boolean NOT NULL DEFAULT false,
  fix_mode          text NOT NULL DEFAULT 'report_only'
                    CHECK (fix_mode IN ('report_only','auto_fix','per_finding')),
  layers            jsonb NOT NULL DEFAULT '["static"]'::jsonb,
  trigger_on_demand boolean NOT NULL DEFAULT true,
  trigger_scheduled boolean NOT NULL DEFAULT false,
  schedule_cron     text,
  trigger_on_pr     boolean NOT NULL DEFAULT false,
  workflow_sha      text,                                -- commit sha of the committed enry-cruise.yml
  runner_version    integer,                             -- managed-marker version we last committed
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, full_name)
);

-- ── Scans ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cruise_scans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id       uuid NOT NULL REFERENCES cruise_repos(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trigger       text NOT NULL CHECK (trigger IN ('on_demand','scheduled','on_pr')),
  fix_mode      text NOT NULL,                           -- config snapshot at dispatch
  layers        jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','partial','completed','failed','cancelled')),
  token_hash    text NOT NULL,                           -- sha256 of the scan token; raw never stored
  run_id        bigint,                                  -- GitHub Actions run id, once known
  layer_status  jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {"static":"done"}
  error         text,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at  timestamptz,                             -- runner pings; watchdog reads this
  finished_at   timestamptz
);
-- Concurrency guard: at most one live scan per repo (prevents scheduled/on-demand races).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cruise_one_active_scan
  ON cruise_scans (repo_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_cruise_scans_repo ON cruise_scans (repo_id, dispatched_at DESC);

-- ── Findings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cruise_findings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id       uuid NOT NULL REFERENCES cruise_scans(id) ON DELETE CASCADE,
  layer         text NOT NULL CHECK (layer IN ('static','llm_review','runtime')),
  severity      text NOT NULL CHECK (severity IN ('critical','high','medium','low','info')),
  confidence    real NOT NULL DEFAULT 0.5,
  -- Stable across scans: hash(file, rule/code, normalized message). Lets a
  -- dismissal suppress the same issue on every future scan, and keeps scan
  -- history diffs meaningful despite non-deterministic layers.
  fingerprint   text NOT NULL,
  file_path     text,
  line_start    integer,
  line_end      integer,
  title         text NOT NULL,
  detail        text NOT NULL,
  suggested_fix text,                                    -- null in Phase 1 (report-only)
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','fix_requested','fixed','dismissed','not_a_bug')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id, fingerprint)                          -- idempotent ingest, no dup per scan
);
CREATE INDEX IF NOT EXISTS idx_cruise_findings_scan ON cruise_findings (scan_id, severity);

-- ── Dismissals (suppression that survives across scans) ──────────────────────
CREATE TABLE IF NOT EXISTS cruise_dismissals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id       uuid NOT NULL REFERENCES cruise_repos(id) ON DELETE CASCADE,
  fingerprint   text NOT NULL,
  reason        text NOT NULL CHECK (reason IN ('dismissed','not_a_bug')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, fingerprint)
);

-- Same RLS posture as every other table here: enabled, and all server routes
-- use the service-role client which bypasses it.
ALTER TABLE cruise_repos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cruise_scans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cruise_findings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cruise_dismissals ENABLE ROW LEVEL SECURITY;
