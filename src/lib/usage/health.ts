import { supabase } from '@/lib/supabase'
import { isTableMissing } from './log'

// ───────────────────────────────────────────────────────────────────
// Real per-model health metrics, aggregated from usage_log — no static
// data, no Math.random(). Mirrors the fetch-once-aggregate-in-JS pattern
// established in usage/log.ts (personal-scale data volume, no need for
// SQL-side grouping).
//
// Window: fetch 7 days so lastSuccessAt/lastFailureAt can reach back
// further than the 24h "recent health" window that avgLatencyMs,
// successRate, errorRate, and the sparkline are computed from — a model
// idle for 2 days shouldn't report a stale-looking "last success 2d ago"
// as if it were 7 days ago just because the metrics window is narrower.
// ───────────────────────────────────────────────────────────────────

interface HealthRow {
  model_id: string
  latency_ms: number
  status: string
  created_at: string
}

export interface ModelHealthMetrics {
  modelId: string
  /** True if usage_log has any rows for this model in the fetch window. */
  hasData: boolean
  /** True if there's at least one row within the last 24h (backs the sparkline/rate figures). */
  hasRecentData: boolean
  avgLatencyMs: number
  successRate: number // 0-100
  errorRate: number // 0-100
  requestsToday: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  /** Last 24 hourly buckets. Buckets with no successful requests are 0 —
   *  the UI must not chart these as if they were real 0ms latencies. */
  latencyHistory: { hour: string; latencyMs: number; hasData: boolean }[]
}

function emptyMetrics(modelId: string): ModelHealthMetrics {
  return {
    modelId,
    hasData: false,
    hasRecentData: false,
    avgLatencyMs: 0,
    successRate: 0,
    errorRate: 0,
    requestsToday: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    latencyHistory: [],
  }
}

/** Fetches usage_log for the last 7 days and aggregates real per-model health metrics. */
export async function getModelHealthMetrics(userId: string): Promise<Record<string, ModelHealthMetrics>> {
  const now = Date.now()
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const since24h = new Date(now - 24 * 60 * 60 * 1000)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('usage_log')
    .select('model_id, latency_ms, status, created_at')
    .eq('user_id', userId)
    .gte('created_at', since7d.toISOString())
    .order('created_at', { ascending: true })
    .limit(5000)

  const result: Record<string, ModelHealthMetrics> = {}
  // Table not applied yet, or a genuine query error — every model reports
  // "no data" rather than silently pretending nothing changed.
  if (isTableMissing(error) || error || !data) return result

  const rows = data as HealthRow[]
  const byModel = new Map<string, HealthRow[]>()
  for (const r of rows) {
    const arr = byModel.get(r.model_id)
    if (arr) arr.push(r)
    else byModel.set(r.model_id, [r])
  }

  for (const [modelId, modelRows] of byModel) {
    const recentRows = modelRows.filter((r) => new Date(r.created_at) >= since24h)
    const metricRows = recentRows.length > 0 ? recentRows : modelRows // fall back to full 7d window if idle in the last 24h

    const successRows = metricRows.filter((r) => r.status === 'success')
    const total = metricRows.length
    const successCount = successRows.length
    const avgLatencyMs = successRows.length
      ? Math.round(successRows.reduce((s, r) => s + r.latency_ms, 0) / successRows.length)
      : total
        ? Math.round(metricRows.reduce((s, r) => s + r.latency_ms, 0) / total)
        : 0
    const successRate = total ? Math.round((successCount / total) * 100) : 0
    const errorRate = total ? 100 - successRate : 0

    const requestsToday = modelRows.filter((r) => new Date(r.created_at) >= todayStart).length

    let lastSuccessAt: string | null = null
    let lastFailureAt: string | null = null
    for (const r of modelRows) {
      if (r.status === 'success') lastSuccessAt = r.created_at
      else lastFailureAt = r.created_at
    }

    // Hourly sparkline — last 24 buckets ending now. Only successful
    // requests contribute latency; a bucket with no successes is flagged
    // hasData: false so the UI can skip it rather than draw a fake 0ms dip.
    const buckets: { hour: string; sum: number; count: number }[] = []
    for (let i = 23; i >= 0; i--) {
      buckets.push({ hour: new Date(now - i * 60 * 60 * 1000).toISOString().slice(0, 13) + ':00', sum: 0, count: 0 })
    }
    for (const r of recentRows) {
      if (r.status !== 'success') continue
      const t = new Date(r.created_at).getTime()
      const idx = 23 - Math.floor((now - t) / (60 * 60 * 1000))
      if (idx >= 0 && idx < 24) {
        buckets[idx].sum += r.latency_ms
        buckets[idx].count += 1
      }
    }
    const latencyHistory = buckets.map((b) => ({
      hour: b.hour,
      latencyMs: b.count ? Math.round(b.sum / b.count) : 0,
      hasData: b.count > 0,
    }))

    result[modelId] = {
      modelId,
      hasData: true,
      hasRecentData: recentRows.length > 0,
      avgLatencyMs,
      successRate,
      errorRate,
      requestsToday,
      lastSuccessAt,
      lastFailureAt,
      latencyHistory,
    }
  }

  return result
}

export { emptyMetrics as emptyHealthMetrics }
