import { generateText } from 'ai'
import { nimClientFor, DEFAULT_NIM_MODEL, parseJsonLoose } from '../nim'
import { generateEmbedding } from '../embeddings'
import { searchMemories } from '../memory'
import { supabase } from '../supabase'
import { casUpdateSessionPayload, loadSessionPayload } from '../session-cas'
import type { LearnSessionPayload } from '../resources'

// Learn's server-side orchestration — sibling to terminal/write-ops.ts, same
// role for Learn that write-ops.ts plays for Drive: every verb's actual
// business logic lives here, the route just parses the request and persists
// session state around a call into this module. See LEARN.md for the full
// contract (claim lifecycle, claim_events registry, extension points).

export interface LearnOpsContext {
  userId: string        // profiles.id (uuid) — claims.user_id FK
  googleId?: string      // raw session id — memories table keys on this, not profiles.id
  sessionId: string
  model?: string
}

export const LEARN_VERBS = ['learn', 'probe', 'gap', 'defend', 'teach', 'retire'] as const
export type LearnVerb = typeof LEARN_VERBS[number]

export interface LearnOpsResult {
  output: string
  exitCode: number
  data?: Record<string, unknown>
}

// ── Verb dispatcher ──────────────────────────────────────────────────────
// Every verb is registered and routed here from day one, even the ones with
// no implementation yet — a feature agent adds a real function and swaps one
// line in this switch, never touches the route or the client's verb list.
export async function dispatchLearn(verb: LearnVerb, args: string, ctx: LearnOpsContext): Promise<LearnOpsResult> {
  switch (verb) {
    case 'learn':
      return learnTopic(ctx, args)
    case 'probe':
      return probeNext(ctx, args)
    case 'gap':
    case 'defend':
    case 'teach':
    case 'retire':
      return notYetImplemented(verb)
  }
}

function notYetImplemented(verb: LearnVerb): LearnOpsResult {
  return {
    output: `${verb}: not yet implemented. Registered and routed — this is a stub waiting for a feature to be built on top of claims/claim_events. See LEARN.md's extension points.`,
    exitCode: 0,
  }
}

// ── learn "<topic>" ───────────────────────────────────────────────────────
// Breaks a topic (or a pasted source, if the input is long enough to look
// like one) into atomic claims and persists each with a real embedding.
const CLAIM_EXTRACTION_SYSTEM_PROMPT = `You are enry's learning agent, breaking a topic or source text into atomic claims — single, standalone things a learner should come to know or believe, each independently provable true or false.

Rules:
- Each claim is ONE idea in plain prose — not a paragraph, not a list, not multiple facts joined by "and".
- Claims must be self-contained: correct and understandable without the surrounding topic for context.
- Prefer 5-12 claims for a topic; fewer for a narrow one, more for a broad one. Don't pad to hit a count.
- Assign each claim a short topic label (2-4 words) for grouping — reuse the same label across claims that belong together.

Output JSON only:
{ "claims": [{ "content": string, "topic": string }] }`

// Above this length, treat the input as a pasted source document rather than
// a bare topic name — affects only claims.source_type, not the extraction
// prompt itself.
const SOURCE_TEXT_THRESHOLD = 300

export async function learnTopic(ctx: LearnOpsContext, input: string): Promise<LearnOpsResult> {
  const trimmed = input.trim()
  if (!trimmed) return { output: 'learn: give me a topic or paste a source, e.g. learn "spaced repetition"', exitCode: 1 }

  // The unfair advantage: enry already has a pgvector memory of what this
  // user has asked, built, and decided. Ground claim generation in it instead
  // of treating every topic as a cold start.
  let memoryContext = ''
  if (ctx.googleId) {
    const { results } = await searchMemories(ctx.googleId, trimmed, 5)
    if (results.length > 0) {
      memoryContext = `\n\nRelevant prior context about this user (from memory — tailor claims to it, don't restate what they clearly already know unless the topic requires it):\n${results.map((r) => `- ${r.content}`).join('\n')}`
    }
  }

  const isSourceText = trimmed.length > SOURCE_TEXT_THRESHOLD
  const sourceType = isSourceText ? 'import' : 'derived'

  try {
    const client = nimClientFor(ctx.model)
    const { text } = await generateText({
      model: client.chat(ctx.model ?? DEFAULT_NIM_MODEL),
      system: CLAIM_EXTRACTION_SYSTEM_PROMPT,
      prompt: `${isSourceText ? 'Source text' : 'Topic'}: ${trimmed}${memoryContext}\n\nExtract the claims now.`,
      temperature: 0.3,
      maxOutputTokens: 2000,
      timeout: 40_000,
      maxRetries: 0,
    })

    const parsed = parseJsonLoose<{ claims: { content: string; topic: string }[] }>(text)
    if (!parsed || !Array.isArray(parsed.claims) || parsed.claims.length === 0) {
      return { output: 'learn: could not extract any claims from that — try rephrasing the topic or pasting more source text.', exitCode: 1 }
    }

    const nowIso = new Date().toISOString()
    const created: { id: string; content: string }[] = []
    for (const c of parsed.claims) {
      const content = (c.content ?? '').trim()
      if (!content) continue
      const embedding = await generateEmbedding(content, 'passage')
      const { data, error } = await supabase
        .from('claims')
        .insert({
          user_id: ctx.userId,
          content,
          topic: (c.topic ?? trimmed).trim(),
          source_type: sourceType,
          embedding: embedding ? JSON.stringify(embedding) : null,
          strength: 1.0,
          half_life: 24,
          status: 'active',
          next_probe_at: nowIso, // due immediately — first probe can happen right away
        })
        .select('id, content')
        .single()
      if (error) {
        console.error('[learn-ops] claim insert failed:', error)
        continue
      }
      created.push(data)
    }

    if (created.length === 0) {
      return { output: 'learn: generated claims but none saved — check server logs.', exitCode: 1 }
    }

    const summary = created.map((c, i) => `${i + 1}. ${c.content}`).join('\n')
    return {
      output: `learned ${created.length} claim${created.length === 1 ? '' : 's'} on "${trimmed}":\n${summary}`,
      exitCode: 0,
      data: { claims: created },
    }
  } catch (err) {
    console.error('[learn-ops] learnTopic threw:', err)
    const name = err instanceof Error ? err.name : ''
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = name === 'TimeoutError' || name === 'AbortError' || /abort|timed?\s?out/i.test(msg)
    return { output: isTimeout ? 'learn: generation timed out — try a narrower topic.' : `learn: ${msg}`, exitCode: 1 }
  }
}

// ── probe ─────────────────────────────────────────────────────────────────
// Two phases sharing one verb, same "one pending thing at a time" discipline
// as Drive's pending_diff: called with no answer, it surfaces the next due
// claim and remembers it as this session's pending_probe. Called again with
// an answer while a probe is pending, it records the answer as an event and
// reschedules. The base does NOT grade correctness — that's Confidence
// Calibration / Explain-Back grading, both explicitly out of scope here. It
// only logs and reschedules using the claim's existing half_life.
export async function probeNext(ctx: LearnOpsContext, answer: string): Promise<LearnOpsResult> {
  const payload = await loadSessionPayload<LearnSessionPayload>(ctx.sessionId, ctx.userId)
  const pending = payload?.pending_probe
  const trimmedAnswer = answer.trim()

  if (pending && trimmedAnswer) {
    return recordAnswer(ctx, pending, trimmedAnswer)
  }
  if (pending && !trimmedAnswer) {
    // Already waiting on an answer — re-surface it instead of picking a new
    // claim, so a bare `probe` never silently abandons what's in flight.
    return { output: `still waiting on: ${pending.content}`, exitCode: 0, data: { claim_id: pending.claim_id, content: pending.content } }
  }
  return surfaceNextDue(ctx)
}

async function surfaceNextDue(ctx: LearnOpsContext): Promise<LearnOpsResult> {
  const nowIso = new Date().toISOString()
  const { data: due, error } = await supabase
    .from('claims')
    .select('id, content, topic')
    .eq('user_id', ctx.userId)
    .eq('status', 'active')
    .or(`next_probe_at.is.null,next_probe_at.lte.${nowIso}`)
    .order('next_probe_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[learn-ops] probe due-claim query failed:', error)
    return { output: `probe: could not check for due claims — ${error.message}`, exitCode: 1 }
  }
  if (!due) {
    return { output: 'probe: nothing due right now. Run learn "<topic>" to add more, or check back later.', exitCode: 0 }
  }

  const askedAt = new Date().toISOString()
  const { error: eventError } = await supabase.from('claim_events').insert({
    claim_id: due.id,
    event_type: 'probe_asked',
    payload: { content: due.content },
  })
  if (eventError) console.error('[learn-ops] probe_asked event insert failed (probe still surfaced):', eventError)

  const persisted = await casUpdateSessionPayload<LearnSessionPayload>(ctx.sessionId, ctx.userId, () => ({
    pending_probe: { claim_id: due.id, content: due.content, topic: due.topic, asked_at: askedAt },
  }))
  if (!persisted) console.error('[learn-ops] failed to persist pending_probe for session', ctx.sessionId)

  return {
    output: `Explain in your own words: ${due.content}`,
    exitCode: 0,
    data: { claim_id: due.id, content: due.content, topic: due.topic },
  }
}

async function recordAnswer(
  ctx: LearnOpsContext,
  pending: NonNullable<LearnSessionPayload['pending_probe']>,
  answer: string,
): Promise<LearnOpsResult> {
  const { error: eventError } = await supabase.from('claim_events').insert({
    claim_id: pending.claim_id,
    event_type: 'answer_recorded',
    payload: { answer, asked_at: pending.asked_at },
  })
  if (eventError) {
    console.error('[learn-ops] answer_recorded event insert failed:', eventError)
    return { output: `probe: failed to record your answer — ${eventError.message}`, exitCode: 1 }
  }

  const { data: claimRow } = await supabase
    .from('claims')
    .select('half_life')
    .eq('id', pending.claim_id)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  const halfLife = claimRow?.half_life ?? 24
  const now = new Date()
  const nextProbeAt = new Date(now.getTime() + halfLife * 3_600_000).toISOString()

  const { error: updateError } = await supabase
    .from('claims')
    .update({ last_probed_at: now.toISOString(), next_probe_at: nextProbeAt, updated_at: now.toISOString() })
    .eq('id', pending.claim_id)
    .eq('user_id', ctx.userId)
  if (updateError) console.error('[learn-ops] claim reschedule failed (event already recorded):', updateError)

  await casUpdateSessionPayload<LearnSessionPayload>(ctx.sessionId, ctx.userId, () => ({ pending_probe: null }))

  return {
    output: `answer recorded for "${pending.content}". Next check-in: ${nextProbeAt}.`,
    exitCode: 0,
    data: { claim_id: pending.claim_id, next_probe_at: nextProbeAt },
  }
}
