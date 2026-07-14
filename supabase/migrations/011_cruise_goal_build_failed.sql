-- Enry Cruise goal mode: add the 'build_failed' terminal status. A run whose
-- steps all committed but whose repo build (npm run build — vite/next/etc.)
-- then fails produces work that isn't mergeable. It gets a DRAFT PR and this
-- status, not a green 'completed'. Run this in the Supabase SQL editor.
--
-- Until applied, the finalize route falls back to 'completed' for such runs
-- (the draft PR + build-error message are still written), so nothing strands —
-- this migration just enables the precise label.

ALTER TABLE cruise_goal_runs DROP CONSTRAINT IF EXISTS cruise_goal_runs_status_check;
ALTER TABLE cruise_goal_runs ADD CONSTRAINT cruise_goal_runs_status_check
  CHECK (status IN ('queued','planning','running','awaiting_clarification','completed','capped','no_changes','build_failed','failed','cancelled'));
