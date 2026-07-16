-- Enry Cruise: restores the goal-run pipeline (deleted by a prior commit) as
-- the actuator for category-triggered scan-and-fix ONLY — the open-ended
-- natural-language goal input and per-finding LLM fix mode stay removed.
--
-- Two columns cruise_goal_runs needs that never existed even before the
-- removal (the earlier scanfix pivot added scanfix_categories to
-- cruise_repos/cruise_scans in 013, but never to cruise_goal_runs itself):
--   scanfix_categories — the effective category config snapshotted onto each
--     run at creation, so a later repo-config change (or a scheduled run using
--     a different subset) can't alter an in-flight run.
--   trigger — distinguishes on_demand (interactive) vs scheduled runs; the
--     'scheduled' value is unused until the Auto-run cron lands, added now so
--     the same column doesn't need a second migration later.
-- Run this in the Supabase SQL editor.

ALTER TABLE cruise_goal_runs
  ADD COLUMN IF NOT EXISTS scanfix_categories jsonb,
  ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'on_demand'
    CHECK (trigger IN ('on_demand','scheduled'));
