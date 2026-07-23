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

export interface RecentActivity {
  mode: UsageMode | null
  modelId: string | null
  modelLabel: string | null
  /** ISO timestamp of the most recent request, or null if there's no usage_log/skill_invocations data at all. */
  at: string | null
  /** True when the most recent request was within the last 5 minutes — the only honest definition of "live." */
  isActive: boolean
}

const ACTIVE_WINDOW_MS = 5 * 60 * 1000

function idle(): RecentActivity {
  return { mode: null, modelId: null, modelLabel: null, at: null, isActive: false }
}

export async function getRecentActivity(userId: string): Promise<RecentActivity> {
  const { data, error } = await supabase
    .from('usage_log')
    .select('model_id, mode, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!isTableMissing(error) && data) {
    const at = data.created_at as string
    return {
      mode: (data.mode as UsageMode) ?? null,
      modelId: data.model_id as string,
      modelLabel: getModelMeta(data.model_id as string)?.label ?? (data.model_id as string),
      at,
      isActive: Date.now() - new Date(at).getTime() < ACTIVE_WINDOW_MS,
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

  if (!sData) return idle()

  const at = sData.created_at as string
  return {
    mode: (sData.mode as UsageMode) ?? null,
    modelId: (sData.model_used as string) ?? null,
    modelLabel: sData.model_used ? (getModelMeta(sData.model_used as string)?.label ?? (sData.model_used as string)) : null,
    at,
    isActive: Date.now() - new Date(at).getTime() < ACTIVE_WINDOW_MS,
  }
}
