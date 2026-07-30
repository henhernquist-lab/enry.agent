import { supabase } from '@/lib/supabase'
import { isTableMissing } from '@/lib/usage/log'
import { GROQ_TPD_LIMITS } from '@/lib/usage/tpd'

// Rolling-24h TPD consumption rollup. Split from tpd.ts so the error
// sanitizer can use the pure parsing helpers without pulling Supabase into
// its module graph.

export type TpdState = 'ok' | 'warning' | 'critical' | 'exhausted' | 'unknown'

export interface TpdStatus {
  modelId: string
  limit: number
  /** Lower bound on tokens spent in the trailing 24h. */
  consumed: number
  remaining: number
  fraction: number
  state: TpdState
}

/** Warn early, because the estimate undercounts (see estimateConsumed). */
const WARNING_AT = 0.7
const CRITICAL_AT = 0.9

function stateFor(fraction: number): TpdState {
  if (fraction >= 1) return 'exhausted'
  if (fraction >= CRITICAL_AT) return 'critical'
  if (fraction >= WARNING_AT) return 'warning'
  return 'ok'
}

/**
 * Rolling-24h token consumption per Groq model, from usage_log.
 *
 * This is deliberately a LOWER BOUND, for two reasons that both push the same
 * way: usage_log is written from onFinish, so failed turns are missing even
 * though Groq still charged for them; and Groq debits `prompt + max_tokens`
 * while we record actual completion tokens. Real consumption is therefore
 * always at least this and usually more — which is why the warning threshold
 * sits at 70% rather than somewhere tighter.
 */
export async function getTpdStatuses(userId: string): Promise<TpdStatus[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const models = Object.keys(GROQ_TPD_LIMITS)

  const consumed = new Map<string, number>()
  try {
    const { data, error } = await supabase
      .from('usage_log')
      .select('model_id, total_tokens')
      .in('model_id', models)
      .gte('created_at', since)
    if (error) {
      if (!isTableMissing(error)) console.error('[tpd] usage_log query failed:', error.message)
    } else {
      for (const row of (data ?? []) as { model_id: string; total_tokens: number | null }[]) {
        consumed.set(row.model_id, (consumed.get(row.model_id) ?? 0) + (row.total_tokens ?? 0))
      }
    }
  } catch (e) {
    console.error('[tpd] usage_log query threw:', e)
  }
  // userId is accepted for symmetry with the rest of the usage layer, but the
  // cap is per Groq organization, not per app user — so the sum deliberately
  // spans all rows rather than filtering to one user.
  void userId

  return models.map((modelId) => {
    const limit = GROQ_TPD_LIMITS[modelId]
    const used = consumed.get(modelId) ?? 0
    const fraction = limit > 0 ? used / limit : 0
    return {
      modelId,
      limit,
      consumed: used,
      remaining: Math.max(0, limit - used),
      fraction: Math.min(1, fraction),
      state: stateFor(fraction),
    }
  })
}
