-- Enry Cruise: scan-and-fix categories. The pivot from open-ended goal mode to
-- a set of concrete, toggleable finding categories. Each category is detected
-- during a scan and either reported or auto-fixed per repo config. Auto-fixes
-- are deterministic (the repo's own prettier/eslint, or mechanical removals) and
-- ride the existing goal-run pipeline under mode='scanfix'. Run this in the
-- Supabase SQL editor. Additive/idempotent, same as 010-012.

-- Per-repo category config. Each of the 7 keys is 'auto_fix' | 'report_only' |
-- 'off'. Categories 1-6 default to auto_fix; non_functional_buttons defaults to
-- report_only and can't be set to auto_fix without buttons_autofix_confirmed
-- (enforced in /api/cruise/repos/config).
ALTER TABLE cruise_repos
  ADD COLUMN IF NOT EXISTS scanfix_categories jsonb NOT NULL DEFAULT '{
    "dead_code": "auto_fix",
    "formatting": "auto_fix",
    "lint_autofix": "auto_fix",
    "unused_deps": "auto_fix",
    "broken_imports": "auto_fix",
    "debug_statements": "auto_fix",
    "non_functional_buttons": "report_only"
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS buttons_autofix_confirmed boolean NOT NULL DEFAULT false;

-- Which category a finding belongs to, for grouping in the findings UI. Null
-- for legacy tsc/eslint findings that predate categorization.
ALTER TABLE cruise_findings
  ADD COLUMN IF NOT EXISTS category text;

-- Config snapshot at dispatch time, mirroring the existing fix_mode/layers
-- snapshot on the scan row.
ALTER TABLE cruise_scans
  ADD COLUMN IF NOT EXISTS scanfix_categories jsonb;

-- Allow the new 'scanfix' goal-run mode (deterministic category fixes) alongside
-- the existing 'goal' (LLM plan) and 'fix' (LLM over findings) modes. The inline
-- CHECK from 012 is dropped and re-added.
ALTER TABLE cruise_goal_runs DROP CONSTRAINT IF EXISTS cruise_goal_runs_mode_check;
ALTER TABLE cruise_goal_runs ADD CONSTRAINT cruise_goal_runs_mode_check
  CHECK (mode IN ('goal','fix','scanfix'));
