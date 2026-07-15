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
  scanfix_categories: ScanfixConfig
  buttons_autofix_confirmed: boolean
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
