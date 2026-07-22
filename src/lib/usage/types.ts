// Types for the Enry Engine usage system. Shared by the logging path
// (src/lib/usage/log.ts), the dashboard API + UI, and the alerts system
// (src/lib/usage/quota.ts). Kept free of runtime imports so it is safe to
// pull into both server and client bundles.

export type UsageMode = 'chat' | 'drive' | 'cruise' | 'learn' | 'lab'
export type UsageStatus = 'success' | 'error' | 'timeout'
export type UsageRange = 'today' | 'week' | 'month'

export interface UsageLogInput {
  userId: string
  modelId: string
  mode: UsageMode
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costUsd?: number
  latencyMs?: number
  status?: UsageStatus
}

export interface UsageSummary {
  requests: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  estimatedCostUsd: number
  averageLatencyMs: number
  /** True when usage_log isn't populated yet and counts came from the
   *  skill_invocations fallback (no token/cost/latency available). */
  partial: boolean
}

export interface UsageBreakdownEntry {
  key: string
  label: string
  requests: number
  totalTokens: number
  estimatedCostUsd: number
  /** 0..1 share of the parent total (by requests). */
  share: number
}

export type BreakdownDimension = 'model' | 'provider' | 'mode'

export interface UsageTimeseriesPoint {
  /** ISO timestamp (hourly) or YYYY-MM-DD (daily). */
  bucket: string
  /** Display label, e.g. "14:00" or "7/14". */
  label: string
  requests: number
  totalTokens: number
  estimatedCostUsd: number
}

export interface UsageDashboardData {
  range: UsageRange
  summary: UsageSummary
  breakdown: Record<BreakdownDimension, UsageBreakdownEntry[]>
  timeseries: UsageTimeseriesPoint[]
  topModels: UsageBreakdownEntry[]
}

// ─── Alerts + quota sources ────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface UsageAlert {
  /** Stable, namespaced key — "source:unit:threshold". Used for dismissal. */
  key: string
  sourceId: string
  sourceLabel: string
  severity: AlertSeverity
  title: string
  message: string
  percent: number       // 0..100
  used: number
  limit: number
  unit: string          // 'requests' | 'tokens' | 'cost_usd' | 'calls'
}

export interface QuotaUsage {
  sourceId: string
  sourceLabel: string
  used: number
  limit: number
  unit: string
  percent: number       // 0..100
}

/**
 * A pluggable quota source. The local usage source counts the user's own
 * request/cost volume; future provider quota sources (NVIDIA NIM, OpenRouter,
 * Google) implement this interface and register in QUOTA_SOURCES — the
 * dashboard, alert component, and dismissal API stay unchanged.
 */
export interface QuotaSource {
  id: string
  label: string
  /** Returns current usage for a user, or null when this source has no limit
   *  configured for them (unbounded quotas don't alert). */
  getUsage(userId: string): Promise<QuotaUsage | null>
}
