import { generateText } from 'ai'
import { supabase } from './supabase'
import { nimClientFor, DEFAULT_NIM_MODEL, parseJsonLoose } from './nim'
import { getContextSnapshot, findCrossToolPatterns, snapshotToText } from './synthesis'
import { todayISO } from './aperture'
import { executeTool } from './composio'
import type { AperturePayload, BriefingPayload, BriefingFlag } from './resources'

// Chief of Staff: a morning briefing that cross-references every tool and
// surfaces what Henry wouldn't notice himself. Runs after the Aperture so it
// can reference the day's question.

const BRIEFING_SYSTEM_PROMPT = `You are the chief of staff producing Henry's morning briefing. Henry is a
high-school student, track athlete, and software builder. You receive a
structured snapshot of his logged data across every tool, detected cross-tool
patterns, and today's Aperture question. This data is ground truth — every
claim you make must trace to it.

Produce:
- observations: 2–4 cross-tool insights Henry would not notice himself. Each
  should connect at least two data sources when the data allows, must cite its
  evidence with real numbers and dates, and must say something non-obvious.
  "You worked out 3 times this week" is a stat, not an observation. "Your three
  lowest check-ins this month each came the day after a logged workout with no
  rest day before it" is an observation.
- suggested_actions: 1–3 concrete next steps, each with a reason tied to an
  observation or pattern, each specific enough to do today ("re-run the 400m
  split calculator with Tuesday's 58.2", not "focus on recovery"). Actions may
  include a product suggestion when logged data supports it, but you never
  purchase, order, subscribe, or initiate any transaction or spend of any kind
  — every action is only a suggestion Henry may choose to act on himself.
- flag (optional, at most one): something genuinely concerning — an eroding
  streak, a deadline collision, a consistency signal worth attention. Most days
  there is no flag; include one only when the data warrants it.
  severity: "low" | "medium" | "high".

Rules:
- No fabrication. A claim without data behind it does not go in the briefing.
- No filler, no praise-padding, no "keep it up!". Direct, factual, brief.
- Each observation's sources array names the tools it drew from,
  e.g. ["checkin", "workout"]. When an observation draws from email context,
  list "gmail" as one of the sources.
- If the snapshot is thin, produce fewer, smaller observations. Two honest
  observations beat four inflated ones.
- Email summary: when the prompt includes recent emails, produce an
  "email_summary" section in the output. Group related messages by sender
  or thread, flag time-sensitive items (reply needed, meetings, deadlines),
  and bucket promotional/newsletter noise separately as "low-signal." If no
  emails are provided or the Gmail note says it's unavailable, skip the
  email section entirely — never fabricate email content.

Output JSON only:
{ "observations": [{ "text": string, "sources": string[] }],
  "suggested_actions": [{ "text": string, "reason": string }],
  "email_summary": { "urgent": string[], "grouped": { "sender": string, "count": number, "topics": string[] }[], "low_signal": string[] } | null,
  "flag": { "text": string, "severity": "low" | "medium" | "high" } | null }`

interface GeneratedBriefing {
  observations: { text: string; sources: string[] }[]
  suggested_actions: { text: string; reason: string }[]
  email_summary?: { urgent: string[]; grouped: { sender: string; count: number; topics: string[] }[]; low_signal: string[] }
  flag: BriefingFlag | null
}

// ─────────────────────────────────────────────────────────────────────────
// Gmail context: fetches the last 24 hours of email via the Composio Gmail
// connector and returns a compact text summary for the briefing prompt.
// Returns null if Gmail is not connected, so the briefing degrades gracefully.
// ─────────────────────────────────────────────────────────────────────────

interface GmailContext {
  emailCount: number
  text: string
}

async function fetchGmailContext(userId: string): Promise<GmailContext | null> {
  try {
    // Check if Gmail is connected for this user
    const { data: connRow } = await supabase
      .from('composio_connections')
      .select('status, composio_connected_account_id')
      .eq('user_id', userId)
      .eq('toolkit', 'gmail')
      .maybeSingle()

    if (!connRow || connRow.status !== 'connected' || !connRow.composio_connected_account_id) {
      return null // Gmail not connected — briefing skips email section gracefully
    }

    // Fetch recent emails (last 24h). Composio resolves the connected account
    // internally from the (userId, authConfigId) pair registered during connect.
    const { data, error } = await executeTool(userId, 'GMAIL_FETCH_EMAILS', {
      max_results: 30,
      query: 'newer_than:1d',
    })

    if (error || !data) {
      console.error('[chief-of-staff] gmail fetch failed:', error)
      return { emailCount: 0, text: '(Gmail fetch failed — check Composio connection)' }
    }

    // Compact render: 150 chars per email max, total 4000 chars cap
    const raw = data as { messages?: Array<{ subject?: string; from?: string; date?: string; snippet?: string; unread?: boolean }> }
    const messages = raw.messages ?? []
    if (messages.length === 0) {
      return { emailCount: 0, text: '(No new emails in the last 24 hours)' }
    }

    const lines: string[] = []
    let total = 0
    for (const m of messages) {
      const line = `- ${m.unread ? '[UNREAD] ' : ''}${m.subject ?? '(no subject)'} | from ${m.from ?? 'unknown'} | ${m.date ?? ''}\n  ${(m.snippet ?? '').slice(0, 150)}`
      if (total + line.length > 4000) break
      lines.push(line)
      total += line.length
    }

    return {
      emailCount: messages.length,
      text: lines.join('\n'),
    }
  } catch (err) {
    console.error('[chief-of-staff] gmail context threw:', err)
    return { emailCount: 0, text: '(Gmail unavailable during briefing generation)' }
  }
}

// Generates and persists today's briefing. `mode: 'refresh'` overwrites the
// existing row for today (used by the manual refresh button, rate-limited by
// the caller); default 'cron' skips if one already exists.
export async function generateBriefingForUser(
  userId: string,
  mode: 'cron' | 'refresh' = 'cron',
): Promise<{ status: 'ok' | 'exists' | 'failed'; id?: string }> {
  const date = todayISO()
  const existing = await findBriefingForDate(userId, date)
  if (existing && mode === 'cron') return { status: 'exists', id: existing.id }

  try {
    const snapshot = await getContextSnapshot(userId, { days: 14 })
    const patterns = await findCrossToolPatterns(userId)
    const stateText = snapshotToText(snapshot, patterns)
    const aperture = await todaysApertureText(userId, date)

    // Fetch Gmail context (last 24h of email). Returns null if Gmail
    // isn't connected — briefing still generates without it.
    const gmailContext = await fetchGmailContext(userId)
    const gmailBlock = gmailContext
      ? `\n\n## Recent Gmail activity (last 24 hours)\n${gmailContext.emailCount} emails received.\n\n${gmailContext.text}`
      : '\n\n## Gmail\n(Gmail not connected — no email data available.\nSkip the email_summary section in your output.)'

    const client = nimClientFor()
    const { text } = await generateText({
      model: client.chat(DEFAULT_NIM_MODEL),
      system: BRIEFING_SYSTEM_PROMPT,
      prompt: `${stateText}\n\n## Today's Aperture question\n${aperture}${gmailBlock}\n\nProduce today's briefing now.`,
      temperature: 0.6,
      maxOutputTokens: 1500,
      // Runs in the same cron route as prompt/article generation (see
      // prompt-generation.ts for the hang this guards against), but this is
      // the richest prompt in the pipeline (full snapshot + patterns text).
      // 20s was measured too tight — real latency for a comparable shape ran
      // 12-19s even on a simpler prompt, leaving no margin. 45s keeps a real
      // ceiling (still far short of the multi-minute hang this exists to
      // catch) while giving normal variance room to breathe.
      timeout: 45_000,
      maxRetries: 1,
    })

    const parsed = parseJsonLoose<GeneratedBriefing>(text)
    if (!parsed || !Array.isArray(parsed.observations)) {
      console.error('[chief-of-staff] generation returned no usable briefing')
      return { status: 'failed' }
    }

    const prevRefreshCount = existing ? (existing.payload as BriefingPayload).refresh_count ?? 0 : 0

    const payload: BriefingPayload = {
      date,
      email_summary: parsed.email_summary,
      observations: parsed.observations
        .filter((o) => o && typeof o.text === 'string')
        .map((o) => ({ text: o.text, sources: Array.isArray(o.sources) ? o.sources.filter((s) => typeof s === 'string') : [] })),
      suggested_actions: (parsed.suggested_actions ?? [])
        .filter((a) => a && typeof a.text === 'string')
        .map((a) => ({ text: a.text, reason: typeof a.reason === 'string' ? a.reason : '', completed: false })),
      flag: parsed.flag && typeof parsed.flag.text === 'string' ? parsed.flag : undefined,
      generated_at: new Date().toISOString(),
      refresh_count: mode === 'refresh' ? prevRefreshCount + 1 : prevRefreshCount,
    }

    const title = `Briefing — ${date}`

    if (existing) {
      const { error } = await supabase
        .from('resources')
        .update({ payload, title, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) {
        console.error('[chief-of-staff] update failed:', error)
        return { status: 'failed' }
      }
      return { status: 'ok', id: existing.id }
    }

    const { data, error } = await supabase
      .from('resources')
      .insert({ user_id: userId, type: 'briefing', source: 'daily_auto', title, payload })
      .select('id')
      .single()

    if (error) {
      console.error('[chief-of-staff] insert failed:', error)
      return { status: 'failed' }
    }
    return { status: 'ok', id: data.id }
  } catch (err) {
    console.error('[chief-of-staff] generation threw:', err)
    return { status: 'failed' }
  }
}

export async function findBriefingForDate(
  userId: string,
  date: string,
): Promise<{ id: string; payload: BriefingPayload } | null> {
  const { data } = await supabase
    .from('resources')
    .select('id, payload')
    .eq('user_id', userId)
    .eq('type', 'briefing')
    .order('created_at', { ascending: false })
    .limit(5)
  const match = (data ?? []).find((r) => (r.payload as BriefingPayload)?.date === date)
  return match ? { id: match.id, payload: match.payload as BriefingPayload } : null
}

async function todaysApertureText(userId: string, date: string): Promise<string> {
  const { data } = await supabase
    .from('resources')
    .select('payload')
    .eq('user_id', userId)
    .eq('type', 'aperture')
    .order('created_at', { ascending: false })
    .limit(3)
  const match = (data ?? []).find((r) => (r.payload as AperturePayload)?.date === date)
  return match ? (match.payload as AperturePayload).question : '(none generated today)'
}
