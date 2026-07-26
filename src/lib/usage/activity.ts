import { supabase } from '@/lib/supabase'
import { getModelMeta } from '@/lib/nim'
import { isTableMissing } from './log'
import type { UsageMode } from './types'

// ───────────────────────────────────────────────────────────────────
// Shared "what is Enry doing right now" source — single source of truth
// for the homepage Live Activity widget, the Room's worker HUD/speech
// bubble, and (idle-state only) the Room's ambient timeline. All three
// read this instead of maintaining separate mock data.
//
// usage_log has no free-text task/prompt column (by design — request
// content isn't persisted), so "current task" is honestly limited to
// mode + model + recency, not a fabricated sentence like "Editing
// src/components/card.tsx". That's the real ceiling of what's knowable.
// ───────────────────────────────────────────────────────────────────

/** A real, recent failure surfaced from Cruise's run tables — never fabricated. */
export interface RecentError {
  /** Which subsystem failed. Cruise is the only persisted, queryable error
   *  source today (cruise_scans / cruise_goal_runs both store status+error). */
  source: 'cruise'
  /** The actual `error` text stored on the failed run, trimmed. Empty string
   *  if the row failed but recorded no reason — the caller must not invent one. */
  reason: string
  /** ISO finished_at of the failed run. */
  at: string
}

export interface RecentActivity {
  mode: UsageMode | null
  modelId: string | null
  modelLabel: string | null
  /** ISO timestamp of the most recent request, or null if there's no usage_log/skill_invocations data at all. */
  at: string | null
  /** True when the most recent request was within the last 5 minutes — the only honest definition of "live." */
  isActive: boolean
  /** A real recent failure, or null. Present only when the failure is more
   *  recent than the latest successful activity (so a later success clears it)
   *  and within MAX_ERROR_AGE_MS (so it never sticks forever). */
  error: RecentError | null
}

const ACTIVE_WINDOW_MS = 5 * 60 * 1000
// A failed run older than this is treated as resolved even with no subsequent
// activity — the Room's error state must not stick forever.
const MAX_ERROR_AGE_MS = 30 * 60 * 1000

function idle(): RecentActivity {
  return { mode: null, modelId: null, modelLabel: null, at: null, isActive: false, error: null }
}

/**
 * Most recent real failure across Cruise's two run tables, or null. These are
 * the existing persisted error signals (scans that fail, goal runs that fail
 * or build_failed) — no new error channel is invented. `finished_at` orders
 * them; only the single most recent is returned.
 */
async function getRecentCruiseError(userId: string): Promise<RecentError | null> {
  const [scans, goals] = await Promise.all([
    supabase
      .from('cruise_scans')
      .select('error, finished_at')
      .eq('user_id', userId)
      .eq('status', 'failed')
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('cruise_goal_runs')
      .select('error, finished_at')
      .eq('user_id', userId)
      .in('status', ['failed', 'build_failed'])
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const candidates: { error: unknown; finished_at: unknown }[] = []
  if (scans.data) candidates.push(scans.data)
  if (goals.data) candidates.push(goals.data)
  if (candidates.length === 0) return null

  const newest = candidates.reduce((a, b) =>
    new Date(String(b.finished_at)).getTime() > new Date(String(a.finished_at)).getTime() ? b : a,
  )
  return {
    source: 'cruise',
    reason: typeof newest.error === 'string' ? newest.error.trim() : '',
    at: String(newest.finished_at),
  }
}

/**
 * Decides whether a real failure should still show as the Room's error state.
 * It clears when a later successful activity arrives (activityAt newer than the
 * failure) or when the failure ages past MAX_ERROR_AGE_MS — never sticks forever.
 */
function resolveError(err: RecentError | null, activityAt: string | null): RecentError | null {
  if (!err) return null
  const failedAt = new Date(err.at).getTime()
  if (Date.now() - failedAt > MAX_ERROR_AGE_MS) return null
  if (activityAt && new Date(activityAt).getTime() >= failedAt) return null
  return err
}

export async function getRecentActivity(userId: string): Promise<RecentActivity> {
  const [{ data, error }, cruiseError] = await Promise.all([
    supabase
      .from('usage_log')
      .select('model_id, mode, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getRecentCruiseError(userId),
  ])

  if (!isTableMissing(error) && data) {
    const at = data.created_at as string
    return {
      mode: (data.mode as UsageMode) ?? null,
      modelId: data.model_id as string,
      modelLabel: getModelMeta(data.model_id as string)?.label ?? (data.model_id as string),
      at,
      isActive: Date.now() - new Date(at).getTime() < ACTIVE_WINDOW_MS,
      error: resolveError(cruiseError, at),
    }
  }

  // Fallback: skill_invocations (real rows, no token/latency, but real mode+model+timestamp).
  const { data: sData } = await supabase
    .from('skill_invocations')
    .select('model_used, mode, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sData) {
    return { ...idle(), error: resolveError(cruiseError, null) }
  }

  const at = sData.created_at as string
  return {
    mode: (sData.mode as UsageMode) ?? null,
    modelId: (sData.model_used as string) ?? null,
    modelLabel: sData.model_used ? (getModelMeta(sData.model_used as string)?.label ?? (sData.model_used as string)) : null,
    at,
    isActive: Date.now() - new Date(at).getTime() < ACTIVE_WINDOW_MS,
    error: resolveError(cruiseError, at),
  }
}
