-- Enry Cruise: finding-fix mode. A fix run reuses the whole goal-run pipeline
-- (edit -> validate -> revert/commit -> build gate -> PR), but its plan comes
-- from a scan's findings instead of the LLM planner — each step fixes the
-- flagged issues in one file. `mode` distinguishes the two; `source_scan_id`
-- links a fix run back to the scan it came from. Run this in the Supabase SQL editor.

ALTER TABLE cruise_goal_runs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'goal' CHECK (mode IN ('goal','fix')),
  ADD COLUMN IF NOT EXISTS source_scan_id uuid REFERENCES cruise_scans(id) ON DELETE SET NULL;
