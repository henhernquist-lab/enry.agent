// computeStrength — retention-estimate for a single claim. Deliberately the
// simplest correct implementation: exponential decay from the claim's own
// half_life, anchored at its last probe (or creation, if never probed).
// Isolated in its own module with this one clean signature so a smarter
// version (streak-aware, event-history-weighted, forgetting-curve-fitted...)
// can replace the body without anything else in Learn changing — every
// caller only ever imports `computeStrength`, never reaches into its
// internals.
//
// `events` is accepted but UNUSED by this default implementation — it's in
// the signature now so a replacement can read event history (streaks,
// confidence trend, answer latency, etc.) without changing every call site
// when it lands.

export interface ClaimForStrength {
  strength: number
  half_life: number
  last_probed_at: string | null
  created_at: string
}

export interface ClaimEventForStrength {
  event_type: string
  created_at: string
  payload: Record<string, unknown>
}

/** Current retention estimate, 0.0 (forgotten) to 1.0 (fully retained). */
export function computeStrength(claim: ClaimForStrength, events: ClaimEventForStrength[]): number {
  void events // unused by this default implementation — see module comment

  const anchor = claim.last_probed_at ?? claim.created_at
  const anchorMs = new Date(anchor).getTime()
  if (Number.isNaN(anchorMs)) return claim.strength

  const hoursElapsed = Math.max(0, (Date.now() - anchorMs) / 3_600_000)
  const halfLife = claim.half_life > 0 ? claim.half_life : 24

  const decayed = claim.strength * Math.pow(0.5, hoursElapsed / halfLife)
  return Math.max(0, Math.min(1, decayed))
}

// How an answered probe adjusts a claim's own decay rate and baseline
// strength — deliberately simple (fixed multipliers, floor/ceiling clamps),
// same "replace me later" posture as computeStrength itself. Called by
// probe() after recording the answer event.
const MIN_HALF_LIFE_HOURS = 1
const MAX_HALF_LIFE_HOURS = 24 * 30 // 30 days

export function nextHalfLife(currentHalfLife: number, wasCorrect: boolean): number {
  const base = currentHalfLife > 0 ? currentHalfLife : 24
  const next = wasCorrect ? base * 1.5 : base * 0.5
  return Math.max(MIN_HALF_LIFE_HOURS, Math.min(MAX_HALF_LIFE_HOURS, next))
}
