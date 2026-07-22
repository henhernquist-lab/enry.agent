import { supabase } from '@/lib/supabase'
import { getModelMeta } from '@/lib/nim'
import { estimateCostUsd } from '@/lib/usage/pricing'
import type {
  UsageLogInput, UsageSummary, UsageRange, UsageBreakdownEntry,
  BreakdownDimension, UsageTimeseriesPoint, UsageMode, UsageDashboardData,
} from '@/lib/usage/types'

// Provider label derived from ModelMeta.company — single source of truth in
// nim.ts, no separate provider map to drift out of sync.
export function providerFor(modelId: string): string {
  const meta = getModelMeta(modelId)
  if (!meta) return 'unknown'
  const c = meta.company
  if (c.includes('OpenRouter')) return 'OpenRouter'
  if (c.includes('NIM')) return 'NVIDIA NIM'
  if (c.includes('Google')) return 'Google'
  if (c.includes('OpenAI')) return 'OpenAI'
  if (c.includes('Moonshot')) return 'Moonshot'
  return c
}

/** True when a supabase error is the "table not applied yet" case. */
export function isTableMissing(error: { message?: string } | null | undefined): boolean {
  return !!error && /does not exist|Could not find|relation/i.test(error.message ?? '')
}

/**
 * Insert a usage row. Resilient by design: a missing table (migration not yet
 * applied) or any DB error is swallowed — usage logging MUST NEVER break a
 * chat/streaming response. Returns the row id or null.
 */
export async function logUsage(input: UsageLogInput): Promise<string | null> {
  try {
    const promptTokens = Math.max(0, Math.floor(input.promptTokens ?? 0))
    const completionTokens = Math.max(0, Math.floor(input.completionTokens ?? 0))
    const totalTokens = input.totalTokens ?? (promptTokens + completionTokens)
    const costUsd = input.costUsd ?? estimateCostUsd(input.modelId, promptTokens, completionTokens)
    const { data, error } = await supabase
      .from('usage_log')
      .insert({
        user_id: input.userId,
        model_id: input.modelId,
        provider: providerFor(input.modelId),
        mode: input.mode,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        cost_usd: costUsd,
        latency_ms: Math.max(0, Math.floor(input.latencyMs ?? 0)),
        status: input.status ?? 'success',
      })
      .select('id')
      .single()
    if (error) {
      // relation-not-exists is expected during rollout — don't spam the log.
      if (!isTableMissing(error)) {
        console.error('[usage] logUsage insert failed:', error.message)
      }
      return null
    }
    return data?.id ?? null
  } catch (err) {
    console.error('[usage] logUsage threw:', err)
    return null
  }
}

// ─── Range → time bounds ──────────────────────────────────────

export function rangeBounds(range: UsageRange): { since: Date; buckets: number; bucketMs: number } {
  const now = Date.now()
  if (range === 'today') {
    const since = new Date(now)
    since.setHours(0, 0, 0, 0)
    return { since, buckets: 24, bucketMs: 60 * 60 * 1000 }          // hourly
  }
  if (range === 'week') {
    return { since: new Date(now - 7 * 24 * 60 * 60 * 1000), buckets: 7, bucketMs: 24 * 60 * 60 * 1000 }
  }
  return { since: new Date(now - 30 * 24 * 60 * 60 * 1000), buckets: 30, bucketMs: 24 * 60 * 60 * 1000 }
}

// ─── Aggregation (fetch-once, bucket in JS) ───────────────────
// Matches the established /api/system/activity pattern: fetch rows in the
// window, aggregate in TypeScript. Volume here is personal-scale (single
// user), so a 5k cap is comfortably above any realistic 30d window.

interface RawUsageRow {
  model_id: string
  mode: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost_usd: number | string
  latency_ms: number
  status: string
  created_at: string
}

interface SkillInvRow {
  model_used: string | null
  mode: string | null
  created_at: string
}

const VALID_MODES = new Set<UsageMode>(['chat', 'drive', 'cruise', 'learn', 'lab'])

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

function modelLabel(modelId: string): string {
  return getModelMeta(modelId)?.label ?? modelId
}

function computeSummary(
  rows: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number; cost_usd?: number | string; latency_ms?: number }[],
  partial: boolean,
): UsageSummary {
  const requests = rows.length
  let totalTokens = 0, promptTokens = 0, completionTokens = 0, cost = 0, latencySum = 0
  for (const r of rows) {
    totalTokens += r.total_tokens || 0
    promptTokens += r.prompt_tokens || 0
    completionTokens += r.completion_tokens || 0
    cost += Number(r.cost_usd) || 0
    latencySum += r.latency_ms || 0
  }
  return {
    requests,
    totalTokens,
    promptTokens,
    completionTokens,
    estimatedCostUsd: round6(cost),
    averageLatencyMs: requests ? Math.round(latencySum / requests) : 0,
    partial,
  }
}

function breakdown(
  rows: RawUsageRow[] | SkillInvRow[],
  dimension: BreakdownDimension,
): UsageBreakdownEntry[] {
  const total = rows.length || 1
  const map = new Map<string, { requests: number; tokens: number; cost: number }>()
  for (const r of rows) {
    const modelId = (r as RawUsageRow).model_id ?? (r as SkillInvRow).model_used ?? 'unknown'
    let key: string
    if (dimension === 'model') {
      key = modelId
    } else if (dimension === 'provider') {
      key = providerFor(modelId)
    } else {
      const mode = (r as RawUsageRow).mode ?? (r as SkillInvRow).mode
      key = mode && VALID_MODES.has(mode as UsageMode) ? mode : 'chat'
    }
    const cur = map.get(key) ?? { requests: 0, tokens: 0, cost: 0 }
    cur.requests += 1
    cur.tokens += (r as RawUsageRow).total_tokens || 0
    cur.cost += Number((r as RawUsageRow).cost_usd) || 0
    map.set(key, cur)
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      label: dimension === 'model' ? modelLabel(key) : key.charAt(0).toUpperCase() + key.slice(1),
      requests: v.requests,
      totalTokens: v.tokens,
      estimatedCostUsd: round6(v.cost),
      share: v.requests / total,
    }))
    .sort((a, b) => b.requests - a.requests)
}

function buildTimeseries(
  rows: { created_at: string; total_tokens?: number; cost_usd?: number | string }[],
  since: Date,
  buckets: number,
  bucketMs: number,
  range: UsageRange,
): UsageTimeseriesPoint[] {
  const points: UsageTimeseriesPoint[] = []
  const startMs = since.getTime()
  const hourly = range === 'today'
  for (let i = 0; i < buckets; i++) {
    const d = new Date(startMs + i * bucketMs)
    points.push({
      bucket: hourly ? d.toISOString() : d.toISOString().slice(0, 10),
      label: hourly
        ? `${String(d.getHours()).padStart(2, '0')}:00`
        : `${d.getMonth() + 1}/${d.getDate()}`,
      requests: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    })
  }
  for (const r of rows) {
    const t = new Date(r.created_at).getTime()
    const idx = Math.floor((t - startMs) / bucketMs)
    if (idx < 0 || idx >= buckets) continue
    points[idx].requests += 1
    points[idx].totalTokens += r.total_tokens || 0
    points[idx].estimatedCostUsd += Number(r.cost_usd) || 0
  }
  return points
}

function buildFromUsageLog(rows: RawUsageRow[], range: UsageRange, since: Date, buckets: number, bucketMs: number): UsageDashboardData {
  const summary = computeSummary(rows, false)
  return {
    range,
    summary,
    breakdown: {
      model: breakdown(rows, 'model'),
      provider: breakdown(rows, 'provider'),
      mode: breakdown(rows, 'mode'),
    },
    timeseries: buildTimeseries(rows, since, buckets, bucketMs, range),
    topModels: [...breakdown(rows, 'model')].slice(0, 5),
  }
}

function buildFromSkillInvocations(rows: SkillInvRow[], range: UsageRange, since: Date, buckets: number, bucketMs: number): UsageDashboardData {
  // skill_invocations has no token/cost/latency — coerce to the row shape with
  // zeros so the same aggregation helpers apply. summary.partial flags this.
  const coerced: RawUsageRow[] = rows.map((r) => ({
    model_id: r.model_used ?? 'unknown',
    mode: r.mode && VALID_MODES.has(r.mode as UsageMode) ? r.mode : 'chat',
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
    latency_ms: 0,
    status: 'success',
    created_at: r.created_at,
  }))
  const summary = computeSummary(coerced, true)
  return {
    range,
    summary,
    breakdown: {
      model: breakdown(coerced, 'model'),
      provider: breakdown(coerced, 'provider'),
      mode: breakdown(coerced, 'mode'),
    },
    timeseries: buildTimeseries(coerced, since, buckets, bucketMs, range),
    topModels: [...breakdown(coerced, 'model')].slice(0, 5),
  }
}

/**
 * Fetch + aggregate everything the dashboard needs for a range. Tries
 * usage_log first; falls back to skill_invocations (request counts only,
 * summary.partial = true) when the usage_log table isn't applied yet.
 */
export async function getUsageData(userId: string, range: UsageRange): Promise<UsageDashboardData> {
  const { since, buckets, bucketMs } = rangeBounds(range)
  const sinceIso = since.toISOString()

  const { data, error } = await supabase
    .from('usage_log')
    .select('model_id, mode, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, status, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(5000)

  if (!isTableMissing(error) && data) {
    return buildFromUsageLog(data as RawUsageRow[], range, since, buckets, bucketMs)
  }

  // Fallback: skill_invocations (real request counts, no tokens/cost/latency).
  const { data: sData } = await supabase
    .from('skill_invocations')
    .select('model_used, mode, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(5000)

  return buildFromSkillInvocations((sData ?? []) as SkillInvRow[], range, since, buckets, bucketMs)
}
