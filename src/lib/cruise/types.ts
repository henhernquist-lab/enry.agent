// Shared Cruise types — the DB row shapes and the small enums the UI and routes
// agree on. Kept in sync with supabase/migrations/008_cruise.sql.

export type CruiseSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type CruiseLayer = 'static' | 'llm_review' | 'runtime'
export type CruiseFixMode = 'report_only' | 'auto_fix' | 'per_finding'

// ── Scan-and-fix categories ──────────────────────────────────────────────────
// The 7 concrete finding classes Cruise detects during a scan. Each is toggled
// per repo to 'auto_fix' (deterministic fix + PR), 'report_only', or 'off'.
export type CruiseScanfixCategory =
  | 'dead_code' | 'formatting' | 'lint_autofix' | 'unused_deps'
  | 'broken_imports' | 'debug_statements' | 'non_functional_buttons'

export type CruiseScanfixMode = 'auto_fix' | 'report_only' | 'off'

export type ScanfixConfig = Record<CruiseScanfixCategory, CruiseScanfixMode>

export const SCANFIX_CATEGORIES: CruiseScanfixCategory[] = [
  'dead_code', 'formatting', 'lint_autofix', 'unused_deps',
  'broken_imports', 'debug_statements', 'non_functional_buttons',
]

export const DEFAULT_SCANFIX_CONFIG: ScanfixConfig = {
  dead_code: 'auto_fix',
  formatting: 'auto_fix',
  lint_autofix: 'auto_fix',
  unused_deps: 'auto_fix',
  broken_imports: 'auto_fix',
  debug_statements: 'auto_fix',
  non_functional_buttons: 'report_only',
}

export const SCANFIX_LABEL: Record<CruiseScanfixCategory, string> = {
  dead_code: 'Dead code',
  formatting: 'Formatting',
  lint_autofix: 'Lint auto-fixables',
  unused_deps: 'Unused dependencies',
  broken_imports: 'Broken imports',
  debug_statements: 'Debug statements',
  non_functional_buttons: 'Non-functional buttons',
}

export type CruiseAutoRunFrequency = 'daily' | 'weekly' | 'every_n_days'

// Per-repo scheduled-run config. Stored in the user's LOCAL time + IANA zone and
// evaluated in that zone each tick — see src/lib/cruise/schedule.ts.
export interface AutoRunConfig {
  auto_run_enabled: boolean
  auto_run_time: string | null            // "HH:MM" 24h local
  auto_run_tz: string | null              // IANA
  auto_run_frequency: CruiseAutoRunFrequency | null
  auto_run_weekday: number | null         // 0=Sun..6=Sat
  auto_run_interval_days: number | null
  auto_run_anchor_date: string | null     // YYYY-MM-DD local
  auto_run_categories: CruiseScanfixCategory[]
  auto_run_last_fired_local_date: string | null
  auto_run_monthly_cap: number
  auto_run_month: string | null           // YYYY-MM local
  auto_run_month_count: number
}

export type CruiseScanStatus = 'queued' | 'running' | 'partial' | 'completed' | 'failed' | 'cancelled'
export type CruiseTrigger = 'on_demand' | 'scheduled' | 'on_pr'
export type CruiseFindingStatus = 'open' | 'fix_requested' | 'fixed' | 'dismissed' | 'not_a_bug'

export const SEVERITY_RANK: Record<CruiseSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
}

export interface CruiseRepo extends AutoRunConfig {
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
  scanfix_categories: ScanfixConfig
  buttons_autofix_confirmed: boolean
  // Caps for a scanfix run (per-run overrides live in cruise_goal_runs; these
  // are the repo defaults). Kept in sync with supabase/migrations/009_cruise_goals.sql.
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
  category: CruiseScanfixCategory | null
  status: CruiseFindingStatus
  created_at: string
}

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
  category?: CruiseScanfixCategory | null
}

// ── Scan-and-fix run (the actuator) ──────────────────────────────────────────
// A goal run works a bounded, deterministic set of category fixes to
// completion across one or more GitHub Actions dispatches, landing every
// change on branch_name and opening a single PR at the end. Kept in sync with
// supabase/migrations/009_cruise_goals.sql. mode is 'scanfix' only — the
// open-ended natural-language goal input and per-finding LLM fix mode were
// removed; this type stays a union only because older DB rows may carry
// 'goal'/'fix' from before that removal.
export type CruiseGoalRunStatus =
  | 'queued' | 'planning' | 'running' | 'awaiting_clarification'
  | 'completed' | 'capped' | 'no_changes' | 'build_failed' | 'failed' | 'cancelled'

export type CruiseGoalStepStatus = 'pending' | 'running' | 'done' | 'failed'

export function isGoalRunActive(status: CruiseGoalRunStatus): boolean {
  return status === 'queued' || status === 'planning' || status === 'running' || status === 'awaiting_clarification'
}

export type CruiseGoalMode = 'goal' | 'fix' | 'scanfix'
export type CruiseGoalTrigger = 'on_demand' | 'scheduled'

export interface CruiseGoalRun {
  id: string
  repo_id: string
  user_id: string
  goal: string
  mode: CruiseGoalMode
  trigger: CruiseGoalTrigger
  scanfix_categories: ScanfixConfig | null
  source_scan_id: string | null
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
