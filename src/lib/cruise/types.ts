// Shared Cruise types — the DB row shapes and the small enums the UI and routes
// agree on. Kept in sync with supabase/migrations/008_cruise.sql.

export type CruiseSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type CruiseLayer = 'static' | 'llm_review' | 'runtime'
export type CruiseFixMode = 'report_only' | 'auto_fix' | 'per_finding'
export type CruiseScanStatus = 'queued' | 'running' | 'partial' | 'completed' | 'failed' | 'cancelled'
export type CruiseTrigger = 'on_demand' | 'scheduled' | 'on_pr'
export type CruiseFindingStatus = 'open' | 'fix_requested' | 'fixed' | 'dismissed' | 'not_a_bug'

// Severity rank for ordering findings (higher = worse).
export const SEVERITY_RANK: Record<CruiseSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
}

export interface CruiseRepo {
  id: string
  user_id: string
  full_name: string
  enabled: boolean
  fix_mode: CruiseFixMode
  layers: CruiseLayer[]
  trigger_on_demand: boolean
  trigger_scheduled: boolean
  schedule_cron: string | null
  trigger_on_pr: boolean
  workflow_sha: string | null
  runner_version: number | null
  goal_cap_files: number
  goal_cap_steps: number
  created_at: string
  updated_at: string
}

export interface CruiseScan {
  id: string
  repo_id: string
  user_id: string
  trigger: CruiseTrigger
  fix_mode: CruiseFixMode
  layers: CruiseLayer[]
  status: CruiseScanStatus
  run_id: number | null
  layer_status: Record<string, string>
  error: string | null
  dispatched_at: string
  heartbeat_at: string | null
  finished_at: string | null
}

export interface CruiseFinding {
  id: string
  scan_id: string
  layer: CruiseLayer
  severity: CruiseSeverity
  confidence: number
  fingerprint: string
  file_path: string | null
  line_start: number | null
  line_end: number | null
  title: string
  detail: string
  suggested_fix: string | null
  status: CruiseFindingStatus
  created_at: string
}

// The shape the runner posts to /api/cruise/ingest for each finding.
export interface IncomingFinding {
  layer: CruiseLayer
  severity: CruiseSeverity
  confidence: number
  fingerprint: string
  file_path: string | null
  line_start: number | null
  line_end: number | null
  title: string
  detail: string
  suggested_fix?: string | null
}

// ── Goal-directed autonomous mode ────────────────────────────────────────────
// A goal run works a natural-language goal to completion (or a cap, or a
// clarify point) across one or more GitHub Actions dispatches, landing every
// change on branch_name and opening a single PR at the end. Kept in sync with
// supabase/migrations/009_cruise_goals.sql.

export type CruiseGoalRunStatus =
  | 'queued' | 'planning' | 'running' | 'awaiting_clarification'
  | 'completed' | 'capped' | 'failed' | 'cancelled'

export type CruiseGoalStepStatus = 'pending' | 'running' | 'done' | 'failed'

export function isGoalRunActive(status: CruiseGoalRunStatus): boolean {
  return status === 'queued' || status === 'planning' || status === 'running' || status === 'awaiting_clarification'
}

export interface CruiseGoalRun {
  id: string
  repo_id: string
  user_id: string
  goal: string
  status: CruiseGoalRunStatus
  run_id: number | null
  branch_name: string
  base_branch: string
  pr_number: number | null
  pr_url: string | null
  cap_files: number
  cap_steps: number
  llm_calls_used: number
  plan: string[] | null
  clarify_question: string | null
  clarify_answer: string | null
  remaining_summary: string | null
  error: string | null
  dispatched_at: string
  heartbeat_at: string | null
  finished_at: string | null
}

export interface CruiseGoalStep {
  id: string
  goal_run_id: string
  seq: number
  description: string
  status: CruiseGoalStepStatus
  detail: string | null
  created_at: string
  updated_at: string
}
