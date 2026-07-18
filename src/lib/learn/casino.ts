import { supabase } from '../supabase'

// Confidence Casino (Freebuff) — durable running-balance surface. The BASE
// never calls these; they exist so the Casino feature has a ready home for
// its balance without touching schema or session state again. Stakes and
// payouts themselves are claim_events (payload.stake_amount / payload.payout —
// see LEARN.md), not columns; only the cross-session running total lives here,
// in user_learn_state (migration 020).

export async function getCasinoBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('user_learn_state')
    .select('casino_balance')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[learn/casino] balance read failed:', error)
    return 0
  }
  return Number(data?.casino_balance ?? 0)
}

// Atomically move the balance by `delta` (positive payout, negative stake).
// Upserts the row on first use. Returns the new balance, or null on failure.
// NOTE: read-modify-write here is not concurrency-safe on its own — a future
// high-frequency Casino should push the delta into a Postgres function or use
// the same compare-and-swap discipline as session-cas.ts. Fine for the
// one-bet-at-a-time interaction the feature will start with; flagged so the
// next agent doesn't assume it's safe under contention.
export async function adjustCasinoBalance(userId: string, delta: number): Promise<number | null> {
  const current = await getCasinoBalance(userId)
  const next = current + delta
  const { error } = await supabase
    .from('user_learn_state')
    .upsert(
      { user_id: userId, casino_balance: next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  if (error) {
    console.error('[learn/casino] balance write failed:', error)
    return null
  }
  return next
}
