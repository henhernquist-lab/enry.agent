import { supabase } from '../supabase'

// ── Confidence Casino ─────────────────────────────────────────────────────
// Combined surface: tonight's session shipped the wager logic (event-log
// audit trail in claim_events: wager_placed / wager_resolved with payload
// containing confidence, amount, payout). Claude Code's Freebuff shipped the
// persistent counter (user_learn_state.casino_balance cross-session running
// total). They coexist on the same DB: every wager_placed deducts from
// user_learn_state.casino_balance, every wager_resolved adds the payout, and
// claim_events stays the authoritative audit log. The CasinoTab component
// calls into this surface; no other entry point exists.
//
// Concurrency note: adjustCasinoBalance is read-modify-write (origin's
// implementation), fine for one-bet-at-a-time Casino UX. High-frequency
// future use should push the delta into a Postgres function — flagged in
// the comments on adjustCasinoBalance below.

// ── Persistent running balance (origin/main: user_learn_state.casino_balance)

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

// NOTE: read-modify-write here is not concurrency-safe on its own — flagged for
// future Postgres-function migration. Fine for one-bet-at-a-time UX.
async function adjustCasinoBalance(userId: string, delta: number): Promise<number | null> {
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

// ── Event-log wager logic (tonight's session) ───────────────────────────

export interface WagerPlacedPayload {
  confidence: number        // 1-5, user's stated confidence
  amount: number            // points wagered
  claim_id: string
  claim_content: string
}

export interface WagerResolvedPayload {
  was_correct: boolean
  payout: number            // positive = gain, negative = loss, 0 = push
  confidence: number        // restated for easy query
  claim_id: string
}

// ── Place a wager ────────────────────────────────────────────────────────
// Called BEFORE the answer is graded. Records the user's stated confidence
// and the amount they're staking. Confidence 1-5 maps linearly to wager size
// (10 points per confidence level, 10-50 range). ALSO deducts the stake from
// user_learn_state.casino_balance so the counter stays in sync with the log.
export async function placeWager(
  claimId: string,
  confidence: number,
  userId: string,
): Promise<{ id: string; amount: number } | { error: string }> {
  const clamped = Math.max(1, Math.min(5, Math.round(confidence)))
  const amount = clamped * 10

  // Synchronized write: insert event FIRST (audit log = source of truth),
  // then deduct from running balance. If the balance write fails, we still
  // have a valid event row — the next getBalance-from-events() reconciliation
  // could resync. We don't roll back the event; easier to resync balance.
  const { data, error } = await supabase
    .from('claim_events')
    .insert({
      claim_id: claimId,
      event_type: 'wager_placed',
      payload: { confidence: clamped, amount },
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  // Best-effort counter sync — never let it kill the wager itself.
  await adjustCasinoBalance(userId, -amount)
  return { id: data.id, amount }
}

// ── Resolve a wager ──────────────────────────────────────────────────────
// Called AFTER the answer is graded. Payout rules:
// - Correct + high confidence (4-5): modest gain (1.5× amount)
// - Correct + low confidence (1-2): big gain (3× amount) — "called my shot"
// - Wrong + high confidence (4-5): big loss (-amount × 1.5) — overconfidence penalty
// - Wrong + low confidence (1-2): small loss (-amount × 0.5) — "knew I wasn't sure"
// - Medium confidence (3): even payout or even loss
// ALSO credits/debits the payout on user_learn_state.casino_balance.
export async function resolveWager(
  claimId: string,
  wasCorrect: boolean,
  userId: string,
): Promise<{ payout: number; confidence: number } | { error: string }> {
  const { data: placed, error: readErr } = await supabase
    .from('claim_events')
    .select('payload, created_at')
    .eq('claim_id', claimId)
    .eq('event_type', 'wager_placed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (readErr || !placed) {
    return { error: readErr?.message ?? 'No wager found for this claim' }
  }

  const p = placed.payload as WagerPlacedPayload
  const confidence = p.confidence ?? 3
  const amount = p.amount ?? 30

  let payout: number
  if (wasCorrect) {
    if (confidence >= 4) payout = Math.round(amount * 1.5)
    else if (confidence <= 2) payout = Math.round(amount * 3.0)
    else payout = Math.round(amount * 1.0)
  } else {
    if (confidence >= 4) payout = -Math.round(amount * 1.5)
    else if (confidence <= 2) payout = -Math.round(amount * 0.5)
    else payout = -Math.round(amount * 1.0)
  }

  const { error: writeErr } = await supabase
    .from('claim_events')
    .insert({
      claim_id: claimId,
      event_type: 'wager_resolved',
      payload: { was_correct: wasCorrect, payout, confidence, claim_id: claimId },
    })

  if (writeErr) return { error: writeErr.message }

  // Best-effort counter sync — payout is signed (±), so credit-on-correct and
  // debit-on-loss happen inside the same adjustedCasinoBalance call.
  await adjustCasinoBalance(userId, payout)
  return { payout, confidence }
}

// ── Compute balance from event log (authoritative reconciliation) ────────
// Scans all wager_resolved events for the user's claims and sums payouts.
// Authoritative — used to verify user_learn_state.casino_balance after a
// rollback. The CasinoTab uses the cached counter on user_learn_state for
// instant render; this is for full reconciliation.
export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('claim_events')
    .select('payload, claim_id')
    .eq('event_type', 'wager_resolved')
    .order('created_at', { ascending: true })

  if (error || !data) return 0

  const claimIds = [...new Set(data.map((d) => d.claim_id))]
  if (claimIds.length === 0) return 0

  const { data: ownedClaims } = await supabase
    .from('claims')
    .select('id')
    .eq('user_id', userId)
    .in('id', claimIds)

  const ownedIds = new Set((ownedClaims ?? []).map((c) => c.id))

  let balance = 0
  for (const row of data) {
    if (!ownedIds.has(row.claim_id)) continue
    const p = row.payload as { payout?: number }
    balance += p.payout ?? 0
  }
  return balance
}

// ── Recent bets ──────────────────────────────────────────────────────────
// Returns the last N resolved wagers for display in the CasinoTab.
export async function getRecentBets(userId: string, limit = 20) {
  const { data: claims, error: claimErr } = await supabase
    .from('claims')
    .select('id, content')
    .eq('user_id', userId)

  if (claimErr || !claims) return []
  const claimMap = new Map(claims.map((c) => [c.id, c.content]))

  const claimIds = claims.map((c) => c.id)
  if (claimIds.length === 0) return []

  const { data: events, error } = await supabase
    .from('claim_events')
    .select('claim_id, event_type, payload, created_at')
    .in('claim_id', claimIds)
    .in('event_type', ['wager_placed', 'wager_resolved'])
    .order('created_at', { ascending: false })
    .limit(limit * 2)

  if (error || !events) return []

  const bets: {
    claim_id: string
    content: string
    confidence: number
    amount: number
    was_correct: boolean | null
    payout: number | null
    placed_at: string
    resolved_at: string | null
  }[] = []

  const resolvedMap = new Map<string, { was_correct: boolean; payout: number; resolved_at: string }>()
  for (const e of events) {
    if (e.event_type === 'wager_resolved') {
      const p = e.payload as { was_correct?: boolean; payout?: number }
      resolvedMap.set(e.claim_id, {
        was_correct: p.was_correct ?? false,
        payout: p.payout ?? 0,
        resolved_at: e.created_at,
      })
    }
  }

  for (const e of events) {
    if (e.event_type !== 'wager_placed') continue
    if (bets.length >= limit) break
    const p = e.payload as { confidence?: number; amount?: number }
    const resolved = resolvedMap.get(e.claim_id)
    bets.push({
      claim_id: e.claim_id,
      content: claimMap.get(e.claim_id) ?? '(deleted)',
      confidence: p.confidence ?? 3,
      amount: p.amount ?? 30,
      was_correct: resolved?.was_correct ?? null,
      payout: resolved?.payout ?? null,
      placed_at: e.created_at,
      resolved_at: resolved?.resolved_at ?? null,
    })
  }

  return bets
}

// ── Calibration data ─────────────────────────────────────────────────────
// Returns stated vs actual confidence over time for the calibration curve.
// Each entry: { confidence: 1-5, total: number, correct: number }
export async function getCalibration(userId: string) {
  const { data: claims } = await supabase
    .from('claims')
    .select('id')
    .eq('user_id', userId)

  if (!claims || claims.length === 0) return []

  const claimIds = claims.map((c) => c.id)

  const { data: events } = await supabase
    .from('claim_events')
    .select('claim_id, event_type, payload')
    .in('claim_id', claimIds)
    .in('event_type', ['wager_placed', 'wager_resolved'])

  if (!events) return []

  const placed = new Map<string, number>()
  for (const e of events) {
    if (e.event_type === 'wager_placed') {
      const p = e.payload as { confidence?: number }
      if (p.confidence) placed.set(e.claim_id, p.confidence)
    }
  }

  const buckets: { confidence: number; total: number; correct: number }[] = [
    { confidence: 1, total: 0, correct: 0 },
    { confidence: 2, total: 0, correct: 0 },
    { confidence: 3, total: 0, correct: 0 },
    { confidence: 4, total: 0, correct: 0 },
    { confidence: 5, total: 0, correct: 0 },
  ]

  for (const e of events) {
    if (e.event_type !== 'wager_resolved') continue
    const conf = placed.get(e.claim_id)
    if (!conf || conf < 1 || conf > 5) continue
    const p = e.payload as { was_correct?: boolean }
    const b = buckets[conf - 1]
    b.total++
    if (p.was_correct) b.correct++
  }

  return buckets.filter((b) => b.total > 0)
}
