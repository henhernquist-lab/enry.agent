// ─── Context Compaction ────────────────────────────────────────────────
// When a conversation exceeds the character threshold, older messages are
// compressed into a compact system message summarizing key decisions,
// files touched, and unresolved questions. The most recent messages stay
// in full. The original full history is never lost — it lives in the
// client's message array and is stored in Supabase via the chat history
// save mechanism.

const COMPACT_THRESHOLD_CHARS = 16_000
const COMPACT_KEEP_RECENT = 6

export interface CompactResult {
  messages: Array<{ role: string; content: string }>
  compacted: boolean
  /** Human-readable summary shown to the user in the indicator. */
  summary: string | null
}

export function compactMessages(
  messages: Array<{ role: string; content: string }>,
): CompactResult {
  const totalChars = messages.reduce(
    (sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0),
    0,
  )

  // Don't compact short conversations or ones under the threshold.
  if (totalChars <= COMPACT_THRESHOLD_CHARS || messages.length <= 10) {
    return { messages, compacted: false, summary: null }
  }

  const olderMsgs = messages.slice(0, -COMPACT_KEEP_RECENT)
  const recentMsgs = messages.slice(-COMPACT_KEEP_RECENT)

  // ── Extract key decisions ────────────────────────────────────────
  const decisions = olderMsgs
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => extractDecisions(m.content))
    .filter((d, i, arr) => arr.indexOf(d) === i) // dedupe
    .slice(0, 5)

  // ── Extract files touched ────────────────────────────────────────
  const files = olderMsgs
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => extractFiles(m.content))
    .filter((f, i, arr) => arr.indexOf(f) === i)
    .slice(0, 5)

  // ── Extract unresolved questions ─────────────────────────────────
  const questions = olderMsgs
    .filter((m) => m.role === 'user')
    .flatMap((m) => extractQuestions(m.content))
    .slice(0, 3)

  // ── Extract user topics (first user sentence of each exchange) ───
  const topics = olderMsgs
    .filter((m) => m.role === 'user')
    .map((m) => firstSentence(m.content).slice(0, 100))
    .filter(Boolean)
    .slice(-6)

  // ── Build compact summary ────────────────────────────────────────
  const parts: string[] = [
    `[Earlier context compacted — ${olderMsgs.length} messages summarized]`,
  ]
  if (decisions.length > 0) parts.push(`Decisions: ${decisions.join(' | ')}`)
  if (files.length > 0) parts.push(`Files: ${files.join(', ')}`)
  if (questions.length > 0) parts.push(`Unresolved: ${questions.join(' | ')}`)
  if (topics.length > 0) parts.push(`Topics: ${topics.join(' → ')}`)

  const systemSummary = parts.join('\n').slice(0, 800)

  const compactedMessages = [
    { role: 'system' as const, content: systemSummary },
    ...recentMsgs,
  ]

  // Human-readable version for the UI indicator (no "[Earlier context...]")
  const humanSummary = parts.slice(1).join('\n') || `${olderMsgs.length} earlier messages summarized`

  return { messages: compactedMessages, compacted: true, summary: humanSummary }
}

// ── Extractors ─────────────────────────────────────────────────────

function firstSentence(text: string): string {
  const match = text.match(/^([^.!?\n]+)/)
  return match ? match[1].trim() : text.slice(0, 80)
}

function extractDecisions(text: string): string[] {
  const found: string[] = []
  const patterns = [
    /(?:decided|agreed|we'll|going with|will use|consensus is|settled on|the plan is|verdict is)\s+([^.!?\n]{15,150})/gi,
  ]
  for (const p of patterns) {
    let m: RegExpExecArray | null
    while ((m = p.exec(text)) !== null) {
      found.push(m[1].trim().slice(0, 120))
    }
  }
  return found
}

function extractFiles(text: string): string[] {
  // Match paths like src/foo/bar.ts, components/baz.tsx, lib/qux.ts
  const re = /\b(?:src\/|components\/|lib\/|app\/|pages\/|docs\/|cruise-runner\/|overnight-runner\/)?[\w.-]+\/(?:[\w.-]+\/)*[\w.-]+\.[a-z]{2,5}\b/gi
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    found.add(m[0])
  }
  return Array.from(found)
}

function extractQuestions(text: string): string[] {
  // Match sentences ending with ? that are likely genuine questions.
  const re = /\b(?:should|would|could|can|what|how|why|where|when|who|is it|are there|do you|does it|will you)\b[^.!?\n]+\?/gi
  const found: string[] = []
  let m: RegExpExecArray | null
  let budget = 0
  while ((m = re.exec(text)) !== null && budget < 200) {
    const q = m[0].trim().slice(0, 120)
    if (q.length > 15) found.push(q)
    budget += q.length
  }
  return found
}
