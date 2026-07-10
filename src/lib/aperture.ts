import { generateText } from 'ai'
import { supabase } from './supabase'
import { generateEmbedding } from './embeddings'
import { nimClientFor, DEFAULT_NIM_MODEL, parseJsonLoose } from './nim'
import { getContextSnapshot, findCrossToolPatterns, snapshotToText } from './synthesis'
import type { AperturePayload } from './resources'

// The Aperture: exactly one question per day, generated from Henry's real
// current state. Not a list. Not advice. One question he answers in 2–5
// sentences, building an archive of his own thinking over time.

const APERTURE_SYSTEM_PROMPT = `You generate exactly one question per day for Henry — a high-school student,
track athlete, and software builder. The question is the single most important
thing for him to confront today.

You receive a structured snapshot of Henry's actual logged data: activity per
tool, streaks and gaps, upcoming events, trends, unfinished threads, and
detected cross-tool patterns, plus his recent questions and answers. This data
is ground truth. Never invent facts that are not in it.

Rules for the question:
- ONE question. No preamble, no list, no advice, nothing before or after it.
- It must be specific to the data. Name the actual numbers, dates, streaks, or
  events it draws on — "your check-ins went 4, 3, 2, 2 in the six days since
  the meet" — that level of specificity.
- Target the gap the data suggests: the thing he is avoiding, deferring, or not
  seeing — the distance between stated intent and logged behavior. Productively
  uncomfortable, never cruel, never shaming.
- Answerable in 2–5 sentences of honest reflection. Not a task. Not a project.
- Never a yes/no question. Never a question that could be asked of a stranger
  ("what are your goals?" is banned). Never a question with an obvious answer.
- Do not re-ask territory covered by his recent questions; find a different
  pressure point.
- If the data is thin, ask about the thinness itself — what stopped, when, and
  what the stopping says. Do not pad thin data into fake specificity.

Output JSON only:
{ "question": string, "context_used": string[] }
context_used: 3–6 short human-readable entries naming what informed the
question, e.g. "check-in ratings, last 14d", "meet countdown: May 3".`

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface GeneratedAperture {
  question: string
  context_used: string[]
}

// Returns { status, id? }. status 'exists' means today's aperture is already
// present (the one-per-day constraint), 'ok' means a new one was created.
export async function generateApertureForUser(
  userId: string,
): Promise<{ status: 'ok' | 'exists' | 'failed'; id?: string; question?: string }> {
  const date = todayISO()

  // One-per-day guard: does an aperture already exist for today?
  const existing = await findApertureForDate(userId, date)
  if (existing) return { status: 'exists', id: existing.id }

  try {
    const snapshot = await getContextSnapshot(userId, { days: 14 })
    const patterns = await findCrossToolPatterns(userId)
    const stateText = snapshotToText(snapshot, patterns)
    const recent = await recentQuestionsText(userId)

    const client = nimClientFor()
    const { text } = await generateText({
      model: client.chat(DEFAULT_NIM_MODEL),
      system: APERTURE_SYSTEM_PROMPT,
      prompt: `${stateText}\n\n## Recent Aperture questions (do not repeat these)\n${recent}\n\nGenerate today's question now.`,
      temperature: 0.8,
      maxOutputTokens: 800,
      // Runs in the same cron route as prompt/article generation — see
      // prompt-generation.ts for the hang this guards against.
      timeout: 20_000,
      maxRetries: 1,
    })

    const parsed = parseJsonLoose<GeneratedAperture>(text)
    if (!parsed || typeof parsed.question !== 'string' || !parsed.question.trim()) {
      console.error('[aperture] generation returned no usable question')
      return { status: 'failed' }
    }

    const payload: AperturePayload = {
      question: parsed.question.trim(),
      date,
      context_used: Array.isArray(parsed.context_used) ? parsed.context_used.filter((c) => typeof c === 'string') : [],
    }

    const { data, error } = await supabase
      .from('resources')
      .insert({
        user_id: userId,
        type: 'aperture',
        source: 'daily_auto',
        title: payload.question.slice(0, 200),
        payload,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[aperture] insert failed:', error)
      return { status: 'failed' }
    }

    // Embed the question so the archive is semantically searchable.
    generateEmbedding(payload.question)
      .then((embedding) => {
        if (embedding) supabase.from('resources').update({ embedding }).eq('id', data.id).then()
      })
      .catch((e) => console.error('[aperture] embedding failed:', e))

    return { status: 'ok', id: data.id, question: payload.question }
  } catch (err) {
    console.error('[aperture] generation threw:', err)
    return { status: 'failed' }
  }
}

async function findApertureForDate(
  userId: string,
  date: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('resources')
    .select('id, payload')
    .eq('user_id', userId)
    .eq('type', 'aperture')
    .order('created_at', { ascending: false })
    .limit(5)
  const match = (data ?? []).find((r) => (r.payload as AperturePayload)?.date === date)
  return match ? { id: match.id } : null
}

async function recentQuestionsText(userId: string): Promise<string> {
  const { data } = await supabase
    .from('resources')
    .select('payload')
    .eq('user_id', userId)
    .eq('type', 'aperture')
    .order('created_at', { ascending: false })
    .limit(10)
  const questions = (data ?? [])
    .map((r) => (r.payload as AperturePayload)?.question)
    .filter(Boolean)
  return questions.length ? questions.map((q) => `- ${q}`).join('\n') : '(none yet)'
}
