// ───────────────────────────────────────────────────────────────────
// Tool results are re-sent on every subsequent step of a tool-calling turn,
// so their size is charged repeatedly against a provider's per-minute budget.
// An unbounded search response is therefore not just a context cost — on Groq
// it decides whether the follow-up request is admitted at all.
//
// Clipping is per-result rather than a slice of the serialized JSON: cutting
// the JSON mid-string yields something the model can't parse, and dropping
// whole results loses the breadth that makes a search useful. Keeping every
// title and URL while shortening each snippet preserves what the model needs
// to cite and follow up.
// ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string
  url: string
  content: string
}

/** Reserve for the answer plus each result's title/url — the parts never clipped. */
const NON_CONTENT_OVERHEAD_PER_RESULT = 120

/** Below this a snippet is too short to carry meaning; drop the result instead. */
const MIN_USEFUL_SNIPPET = 200

/**
 * Bound an arbitrary tool result before it re-enters context.
 *
 * Search results have known structure worth preserving field by field
 * (budgetSearchResults). Everything else — Gmail message bodies above all,
 * which arrive as whole emails from GMAIL_GET_MESSAGE — is opaque provider
 * JSON, so the only safe general move is to walk it and clip the long strings
 * where they sit. That keeps the envelope intact (a message's id, subject and
 * sender survive) while the body, the part with no size ceiling, gets cut.
 *
 * Returns a NEW value; the input is never mutated.
 */
export function clipDeepStrings(
  value: unknown,
  maxStringChars: number,
  budget = { remaining: Number.POSITIVE_INFINITY },
  depth = 0,
): { value: unknown; clipped: boolean } {
  if (depth > 8) return { value: '[…nested too deeply]', clipped: true }

  if (typeof value === 'string') {
    const cap = Math.max(0, Math.min(maxStringChars, budget.remaining))
    if (value.length > cap) {
      budget.remaining = Math.max(0, budget.remaining - cap)
      return { value: value.slice(0, cap) + '…', clipped: true }
    }
    budget.remaining = Math.max(0, budget.remaining - value.length)
    return { value, clipped: false }
  }

  if (Array.isArray(value)) {
    let clipped = false
    const out: unknown[] = []
    // Fair-share the budget across elements instead of letting early ones
    // spend it all. Without this, ten emails whose bodies are long enough to
    // hit the per-string cap consume the whole allowance in the first three,
    // and "what's in my inbox" silently answers about a third of it. Breadth
    // matters more than depth for list results — the model can always open one
    // message by id afterwards.
    const share = value.length > 0 && Number.isFinite(budget.remaining)
      ? Math.floor(budget.remaining / value.length)
      : budget.remaining
    for (const item of value) {
      if (budget.remaining <= 0) { clipped = true; break }
      const sub = { remaining: Math.min(share, budget.remaining) }
      const r = clipDeepStrings(item, maxStringChars, sub, depth + 1)
      clipped = clipped || r.clipped
      // Charge the parent only what this element actually used, so short
      // entries hand their unspent share back to the ones that follow.
      budget.remaining = Math.max(0, budget.remaining - (Math.min(share, budget.remaining) - sub.remaining))
      out.push(r.value)
    }
    return { value: out, clipped }
  }

  if (value && typeof value === 'object') {
    let clipped = false
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = clipDeepStrings(v, maxStringChars, budget, depth + 1)
      clipped = clipped || r.clipped
      out[k] = r.value
    }
    return { value: out, clipped }
  }

  return { value, clipped: false }
}

/**
 * clipDeepStrings budgets string *content*; the serialized result is larger by
 * whatever the keys and punctuation cost, which for a list of email envelopes
 * is around half again. This wrapper makes the cap mean the thing callers
 * actually care about — the size of the JSON that lands in context — by
 * measuring the result and, if it overshoots, re-clipping once with the budget
 * scaled down by the observed ratio. Self-correcting for any payload shape, so
 * there's no fudge factor to drift out of date.
 */
export function clipToSerializedBudget(
  value: unknown,
  maxStringChars: number,
  maxSerializedChars: number,
): { value: unknown; clipped: boolean } {
  const first = clipDeepStrings(value, maxStringChars, { remaining: maxSerializedChars })
  const size = JSON.stringify(first.value)?.length ?? 0
  if (size <= maxSerializedChars) return first

  const ratio = maxSerializedChars / size
  const second = clipDeepStrings(
    value,
    Math.max(80, Math.floor(maxStringChars * ratio)),
    { remaining: Math.max(200, Math.floor(maxSerializedChars * ratio)) },
  )
  return { value: second.value, clipped: true }
}

export function budgetSearchResults(
  answer: string | undefined,
  results: SearchResult[],
  maxChars: number | undefined,
): { answer: string | undefined; results: SearchResult[]; truncated: boolean } {
  if (!maxChars || results.length === 0) return { answer, results, truncated: false }

  const currentSize =
    (answer?.length ?? 0) +
    results.reduce((n, r) => n + r.content.length + r.title.length + r.url.length, 0)
  if (currentSize <= maxChars) return { answer, results, truncated: false }

  // The answer is Tavily's own synthesis — the highest-value tokens per
  // character here, so it survives ahead of the raw snippets.
  const clampedAnswer = answer && answer.length > maxChars / 2 ? answer.slice(0, Math.floor(maxChars / 2)) : answer

  const remaining = maxChars - (clampedAnswer?.length ?? 0)
  let kept = results.length
  let perResult = 0
  // Shed results only once the per-result share can no longer say anything.
  while (kept > 0) {
    perResult = Math.floor(remaining / kept) - NON_CONTENT_OVERHEAD_PER_RESULT
    if (perResult >= MIN_USEFUL_SNIPPET) break
    kept--
  }
  if (kept === 0) {
    kept = 1
    perResult = Math.max(remaining - NON_CONTENT_OVERHEAD_PER_RESULT, MIN_USEFUL_SNIPPET)
  }

  const clipped = results.slice(0, kept).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content.length > perResult ? r.content.slice(0, perResult) + '…' : r.content,
  }))

  return { answer: clampedAnswer, results: clipped, truncated: true }
}
