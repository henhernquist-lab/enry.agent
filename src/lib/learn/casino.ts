// Confidence Casino — wagering on probe answers.
// Every probe answer can include a confidence rating (1-5). The user stakes
// points on their answer, and the system pays out or collects based on
// correctness × confidence. All bets are logged as claim_events (no separate
// table needed — the ledger is in the event log).
//
// Balance is computed from wager_placed/wager_resolved events. A cached
// balance is also stored in the LearnSessionPayload so the tab can render
// instantly without a full event scan.

import { supabase } from '../supabase'

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
// Called BEFORE the answer is graded — records the user's stated confidence
// and the amount they're staking. Confidence 1-5 maps linearly to wager size
// relative to a base stake (10 points per confidence level).
export async function placeWager(
  claimId: string,
  confidence: number,  // 1-5
  userId: string,
): Promise<{ id: string; amount: number } | { error: string }> {
  const clamped = Math.max(1, Math.min(5, Math.round(confidence)))
  const amount = clamped * 10 // 10-50 points

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
  return { id: data.id, amount }
}

// ── Resolve a wager ──────────────────────────────────────────────────────
// Called AFTER the answer is graded. Payout rules:
// - Correct + high confidence (4-5): modest gain (1.5× amount)
// - Correct + low confidence (1-2): big gain (3× amount) — "called my shot"
// - Wrong + high confidence (4-5): big loss (-amount × 1.5) — overconfidence penalty
// - Wrong + low confidence (1-2): small loss (-amount × 0.5) — "knew I wasn't sure"
// - Medium confidence (3): even payout or even loss
export async function resolveWager(
  claimId: string,
  wasCorrect: boolean,
): Promise<{ payout: number; confidence: number } | { error: string }> {
  // Find the most recent wager_placed event for this claim
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
    else payout = Math.round(amount * 1.0) // confidence 3: even
  } else {
    if (confidence >= 4) payout = -Math.round(amount * 1.5)
    else if (confidence <= 2) payout = -Math.round(amount * 0.5)
    else payout = -Math.round(amount * 1.0) // confidence 3: even loss
  }

  const { error: writeErr } = await supabase
    .from('claim_events')
    .insert({
      claim_id: claimId,
      event_type: 'wager_resolved',
      payload: { was_correct: wasCorrect, payout, confidence, claim_id: claimId },
    })

  if (writeErr) return { error: writeErr.message }
  return { payout, confidence }
}

// ── Compute balance from event log ────────────────────────────────────────
// Scans all wager_resolved events for a user's claims and sums payouts.
// Returns the running total. For the tab's instant render, the session
// payload caches this — call this for authoritative recalculation.
export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('claim_events')
    .select('payload, claim_id')
    .eq('event_type', 'wager_resolved')
    .order('created_at', { ascending: true })

  if (error || !data) return 0

  // Filter to only this user's claims (claim_events has claim_id FK to claims
  // which has user_id — we can't join in the query above easily, so filter
  // client-side for now; at this data volume it's fine).
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
// Returns the last N resolved wagers for display in the tab.
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

  // Pair placed/resolved events
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
