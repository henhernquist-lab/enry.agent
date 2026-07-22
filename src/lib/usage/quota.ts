import { supabase } from '@/lib/supabase'
import { getUsageData, isTableMissing } from '@/lib/usage/log'
import type { QuotaSource, QuotaUsage, UsageAlert, AlertSeverity } from '@/lib/usage/types'

// Thresholds (percent) at which alerts fire. Ascending. Per source, only the
// highest threshold currently crossed is surfaced — no stacked 75+90+95 spam.
export const ALERT_THRESHOLDS = [75, 90, 95, 100] as const

function severityFor(percent: number): AlertSeverity {
  if (percent >= 90) return 'critical'
  if (percent >= 75) return 'warning'
  return 'info'
}

// ─── Local usage quota source ────────────────────────────────
// Counts the user's own 30d request volume + cost against configurable soft
// caps. Limits come from env with sane defaults. This is a self-hosted
// estimate, NOT a provider quota — provider quota sources (NVIDIA NIM,
// OpenRouter, Google) register as QuotaSources below once their APIs are
// wired, without touching the dashboard or alert component.

function numEnv(name: string, fallback: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

const REQUEST_LIMIT = numEnv('USAGE_REQUEST_LIMIT_30D', 2000)
const COST_LIMIT = numEnv('USAGE_COST_LIMIT_USD', 25)

export const localUsageQuotaSource: QuotaSource = {
  id: 'local',
  label: 'Enry Engine',
  async getUsage(userId): Promise<QuotaUsage | null> {
    const data = await getUsageData(userId, 'month')
    const s = data.summary
    // Report the tightest constraint. In fallback (partial) mode cost is 0, so
    // requests drive the headline — which is exactly what we have real data
    // for. Once usage_log populates, cost competes and wins when it's closer.
    const reqPercent = REQUEST_LIMIT > 0 ? Math.min(100, (s.requests / REQUEST_LIMIT) * 100) : 0
    const costPercent = COST_LIMIT > 0 && s.estimatedCostUsd > 0
      ? Math.min(100, (s.estimatedCostUsd / COST_LIMIT) * 100)
      : 0
    if (costPercent >= reqPercent && costPercent > 0) {
      return { sourceId: 'local', sourceLabel: 'Enry Engine', used: s.estimatedCostUsd, limit: COST_LIMIT, unit: 'cost_usd', percent: costPercent }
    }
    return { sourceId: 'local', sourceLabel: 'Enry Engine', used: s.requests, limit: REQUEST_LIMIT, unit: 'requests', percent: reqPercent }
  },
}

// ─── Registry ────────────────────────────────────────────────
// Future provider quota sources register here. Adding NVIDIA/OpenRouter quota
// polling later is implementing QuotaSource + pushing into this array — the
// dashboard, alert component, and dismissal API stay unchanged.
export const QUOTA_SOURCES: QuotaSource[] = [localUsageQuotaSource]

export async function getAllQuotaUsage(userId: string): Promise<QuotaUsage[]> {
  const results = await Promise.all(QUOTA_SOURCES.map((s) => s.getUsage(userId).catch(() => null)))
  return results.filter((r): r is QuotaUsage => r !== null)
}

// ─── Alerts ──────────────────────────────────────────────────

function unitLabel(unit: string): string {
  if (unit === 'cost_usd') return 'cost'
  if (unit === 'requests') return 'request'
  return unit
}

function alertMessage(q: QuotaUsage, threshold: number): string {
  if (q.unit === 'cost_usd') {
    return `$${q.used.toFixed(2)} of $${q.limit.toFixed(2)} used this month — ${threshold}% of the soft cap reached.`
  }
  if (q.unit === 'requests') {
    return `${Math.round(q.used).toLocaleString()} of ${q.limit.toLocaleString()} requests this month — ${threshold}% of the soft cap reached.`
  }
  return `${q.used} of ${q.limit} ${q.unit} — ${threshold}% reached.`
}

async function getDismissedKeys(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('usage_alert_dismissals')
    .select('alert_key')
    .eq('user_id', userId)
  if (error || !data) return new Set()   // table not applied → nothing dismissed
  return new Set(data.map((r) => r.alert_key))
}

/**
 * Build the current alert set across all registered quota sources. Per source,
 * only the highest crossed threshold is emitted (no spam), and anything the
 * user dismissed is suppressed. Sorted by severity desc.
 */
export async function getUsageAlerts(userId: string): Promise<UsageAlert[]> {
  const quotas = await getAllQuotaUsage(userId)
  if (!quotas.length) return []
  const dismissed = await getDismissedKeys(userId)
  const alerts: UsageAlert[] = []
  for (const q of quotas) {
    let crossed: number | null = null
    for (const t of ALERT_THRESHOLDS) {
      if (q.percent >= t) crossed = t
    }
    if (crossed === null) continue
    const key = `${q.sourceId}:${q.unit}:${crossed}`
    if (dismissed.has(key)) continue
    alerts.push({
      key,
      sourceId: q.sourceId,
      sourceLabel: q.sourceLabel,
      severity: severityFor(q.percent),
      title: `${crossed}% ${unitLabel(q.unit)} quota used`,
      message: alertMessage(q, crossed),
      percent: q.percent,
      used: q.used,
      limit: q.limit,
      unit: q.unit,
    })
  }
  return alerts.sort((a, b) => b.percent - a.percent)
}

/** Record a dismissal so the alert won't re-surface. Resilient — never throws. */
export async function dismissAlert(userId: string, alertKey: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('usage_alert_dismissals')
      .upsert(
        { user_id: userId, alert_key: alertKey, dismissed_at: new Date().toISOString() },
        { onConflict: 'user_id,alert_key' },
      )
    if (error && !isTableMissing(error)) {
      console.error('[usage] dismissAlert failed:', error.message)
    }
    return !error
  } catch (err) {
    console.error('[usage] dismissAlert threw:', err)
    return false
  }
}
