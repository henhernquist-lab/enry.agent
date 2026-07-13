-- Enry Cruise goal mode: add the 'no_changes' terminal status. A run where
-- every step was reverted (each edit introduced new type/lint errors) or where
-- the goal needed no edits produces zero committed files and opens no PR — it
-- must not be labeled 'completed'. Run this in the Supabase SQL editor.
--
-- Until this is applied, the ingest finalize route falls back to 'failed' for
-- such runs (see the fallback in goal-runs/[id]/ingest), so runs still reach a
-- terminal state — this migration just enables the more precise label.

ALTER TABLE cruise_goal_runs DROP CONSTRAINT IF EXISTS cruise_goal_runs_status_check;
ALTER TABLE cruise_goal_runs ADD CONSTRAINT cruise_goal_runs_status_check
  CHECK (status IN ('queued','planning','running','awaiting_clarification','completed','capped','no_changes','failed','cancelled'));
