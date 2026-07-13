-- Enry Cruise — goal-directed autonomous mode. Builds on 008_cruise.sql's
-- allowlist (a repo enabled for Cruise is enabled for goal runs too — no
-- separate toggle). Run this in the Supabase SQL editor.
--
-- A goal run is a single natural-language goal worked to completion (or a
-- cap, or a stuck/clarify point) autonomously: plan -> read/edit/validate
-- loop -> PR. Unlike cruise_scans (read-only, single dispatch), a goal run
-- can span multiple GitHub Actions dispatches — a clarifying question ends
-- one dispatch and re-answering it triggers a fresh one that resumes from
-- stored context. All actual repo writes happen server-side (see
-- /api/cruise/goal-runs/[id]/apply) via the existing commitFiles/
-- createPullRequest helpers in src/lib/github.ts — the runner never gets
-- push access, so the workflow stays permissions: contents: read.

ALTER TABLE cruise_repos
  ADD COLUMN IF NOT EXISTS goal_cap_files integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS goal_cap_steps integer NOT NULL DEFAULT 40;

-- ── Goal runs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cruise_goal_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id         uuid NOT NULL REFERENCES cruise_repos(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal            text NOT NULL,
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','planning','running','awaiting_clarification','completed','capped','failed','cancelled')),
  token_hash      text NOT NULL,                          -- sha256 of the current dispatch's callback token
  -- Unlike cruise_scans (read-only), a goal run's server-side apply/finalize
  -- steps must call GitHub's write API (commit, PR) from a token-authed CI
  -- callback that has no user session to pull a fresh OAuth token from. This
  -- column holds a copy of the user's GitHub token, captured at create time
  -- (when a session IS present) and used ONLY by the token-authed
  -- apply/ingest routes for this run's own writes. Cleared to NULL the
  -- moment the run reaches a terminal status — it is not a durable stored
  -- credential, just a run-scoped bridge across the session gap. Interim
  -- design: the real fix is a GitHub App issuing short-lived installation
  -- tokens (same "shortcut now, upgrade later" tradeoff as cruise_scans'
  -- per-scan token vs. the planned OIDC federation).
  github_token    text,
  run_id          bigint,                                 -- GitHub Actions run id of the current/last dispatch
  branch_name     text NOT NULL,                           -- enry-cruise/goal-<id>, fixed for the run's lifetime
  base_branch     text NOT NULL,                           -- default branch resolved at create time
  pr_number       integer,
  pr_url          text,
  cap_files       integer NOT NULL,                        -- snapshot of cruise_repos.goal_cap_files at create time
  cap_steps       integer NOT NULL,                        -- snapshot of cruise_repos.goal_cap_steps at create time
  llm_calls_used  integer NOT NULL DEFAULT 0,               -- incremented by /api/cruise/llm, checked against cap_steps
  plan            jsonb,                                    -- the generated plan (list of step descriptions)
  clarify_question text,
  clarify_answer   text,
  remaining_summary text,                                   -- what's left undone, set at finalize when capped/partial
  error           text,
  dispatched_at   timestamptz NOT NULL DEFAULT now(),
  heartbeat_at    timestamptz,
  finished_at     timestamptz
);
-- Concurrency guard: at most one live goal run per repo, same pattern as scans.
-- "Live" includes awaiting_clarification — a paused run still owns its branch.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cruise_one_active_goal_run
  ON cruise_goal_runs (repo_id) WHERE status IN ('queued','planning','running','awaiting_clarification');
CREATE INDEX IF NOT EXISTS idx_cruise_goal_runs_repo ON cruise_goal_runs (repo_id, dispatched_at DESC);

-- ── Step log (live progress checklist) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cruise_goal_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_run_id   uuid NOT NULL REFERENCES cruise_goal_runs(id) ON DELETE CASCADE,
  seq           integer NOT NULL,                          -- runner-assigned order, monotonic within a run
  description   text NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  detail        text,                                       -- optional short result note (e.g. what changed)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_run_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_cruise_goal_steps_run ON cruise_goal_steps (goal_run_id, seq);

-- ── Committed-file cap tracking ───────────────────────────────────────────────
-- One row per distinct path committed during a run. The apply endpoint counts
-- distinct rows against cap_files before allowing a NEW path in; re-editing an
-- already-touched file doesn't cost another slot.
CREATE TABLE IF NOT EXISTS cruise_goal_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_run_id   uuid NOT NULL REFERENCES cruise_goal_runs(id) ON DELETE CASCADE,
  path          text NOT NULL,
  commit_sha    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_run_id, path)
);

ALTER TABLE cruise_goal_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cruise_goal_steps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cruise_goal_files  ENABLE ROW LEVEL SECURITY;
