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
