// ───────────────────────────────────────────────────────────────────
// Groq tokens-per-day (TPD) awareness.
//
// Groq enforces a per-model daily token cap that is invisible in the response
// headers: x-ratelimit-*-tokens describe the per-MINUTE budget only, and the
// only per-day headers are request counts. Verified against live responses and
// Groq's own docs. So a model can report a full 12000 remaining tokens and
// still 429 — the day's budget is gone and nothing in the headers says so.
//
// The cap only announces itself in the 429 body:
//   "...on tokens per day (TPD): Limit 100000, Used 98209, Requested 2372.
//    Please try again in 8m21.984s"
//
// Note it is a ROLLING window, not a midnight reset — Groq hands back a retry
// delay measured in minutes, and budget replenishes continuously. Any message
// promising "resets at midnight" would be wrong.
//
// Two sources of truth, in order of preference:
//   1. The 429 body itself — exact, but only available once you've hit it.
//   2. A rolling 24h sum over usage_log — available continuously, but a LOWER
//      BOUND (see estimateConsumed).
// ───────────────────────────────────────────────────────────────────

/** Free-tier daily token caps, per Groq's published limits. */
export const GROQ_TPD_LIMITS: Record<string, number> = {
  'llama-3.3-70b-versatile': 100_000,
  'openai/gpt-oss-120b': 200_000,
  'llama-3.1-8b-instant': 500_000,
}

export function tpdLimitFor(modelId: string): number | undefined {
  return GROQ_TPD_LIMITS[modelId]
}

export interface TpdExhaustion {
  limit: number
  used: number
  requested: number
  /** Seconds until enough budget frees up, as reported by Groq. */
  retryAfterSeconds: number | null
}

/**
 * Pull the TPD numbers out of a Groq 429 body. Returns null for any other
 * failure, including a per-minute (TPM) 429 — the two must stay
 * distinguishable, since only one of them is fixed by waiting a moment.
 */
export function parseTpdExhaustion(body: string | undefined | null): TpdExhaustion | null {
  if (!body || !/tokens per day/i.test(body)) return null
  const nums = body.match(/Limit\s+(\d+),\s*Used\s+(\d+),\s*Requested\s+(\d+)/i)
  if (!nums) return null
  const retry = body.match(/try again in\s+(?:(\d+)m)?([\d.]+)s/i)
  const retryAfterSeconds = retry
    ? Math.round((Number(retry[1] ?? 0) * 60) + Number(retry[2] ?? 0))
    : null
  return {
    limit: Number(nums[1]),
    used: Number(nums[2]),
    requested: Number(nums[3]),
    retryAfterSeconds,
  }
}

/** Human phrasing for a retry delay, e.g. "about 14 minutes". */
export function formatRetryDelay(seconds: number | null): string {
  if (seconds === null) return 'later today'
  if (seconds < 90) return 'in about a minute'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `in about ${mins} minutes`
  const hours = Math.round(mins / 60)
  return `in about ${hours} hour${hours === 1 ? '' : 's'}`
}
