import { supabase } from './supabase'

// Optimistic-concurrency read-modify-write for any `resources` row used as
// durable per-session state (Drive's terminal_session, Learn's learn_session,
// and any future mode that follows the same pattern). Extracted from
// write-ops.ts (see migration 018_resources_version.sql's history) so a new
// mode reuses this instead of re-implementing its own — the original bug this
// fixed was exactly two independent load -> spread -> full-object-update
// implementations of the same row silently racing each other.
//
// `mutate` receives the LATEST payload on every attempt (never a snapshot
// captured before the retry loop started), so a retry after a detected
// conflict always merges onto current state instead of re-applying a stale
// patch. Requires `resources.version` (migration 018_resources_version.sql).
const CAS_MAX_RETRIES = 5

export async function casUpdateSessionPayload<T extends object>(
  sessionId: string,
  userId: string,
  mutate: (current: T) => Partial<T>,
): Promise<boolean> {
  for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from('resources')
      .select('payload, version')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('[session-cas] casUpdateSessionPayload read failed (is migration 018_resources_version.sql applied?):', error)
      return false
    }
    if (!data) return false
    const current = data.payload as T
    const version = (data as { version?: number }).version ?? 1
    const patch = mutate(current)

    const { data: updated, error: updateError } = await supabase
      .from('resources')
      .update({ payload: { ...current, ...patch }, version: version + 1, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .eq('version', version) // compare-and-swap: only succeeds if nobody else wrote first
      .select('id')
    if (updateError) {
      console.error('[session-cas] casUpdateSessionPayload write failed:', updateError)
      return false
    }
    if (updated && updated.length > 0) return true
    // 0 rows matched -> version moved under us; retry with a fresh read.
  }
  console.error('[session-cas] casUpdateSessionPayload: exhausted retries without resolving a conflict', { sessionId })
  return false
}

export async function loadSessionPayload<T>(sessionId: string, userId: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('resources')
    .select('payload')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data.payload as T
}
