import { generateText } from 'ai'
import { nimClientFor, DEFAULT_NIM_MODEL, parseJsonLoose } from '../nim'
import { generateEmbedding } from '../embeddings'
import { searchMemories } from '../memory'
import { supabase } from '../supabase'
import { casUpdateSessionPayload, loadSessionPayload } from '../session-cas'
import { computeStrength, type ClaimForStrength } from './strength'
import { cosineSimilarity, parseEmbedding } from './map'
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
  /** Recovery mode — the previous LLM call was interrupted and we are retrying. */
  isRecovery?: boolean
  /** Partial content from the interrupted stream, used to build a continuation prompt. */
  partialContent?: string
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
      return gapAnalysis(ctx)
    case 'defend':
      return defendClaim(ctx, args)
    case 'teach':
      return teachClaim(ctx, args)
    case 'retire':
      return retireClaim(ctx, args)
  }
}

// ── learn "<topic>" ───────────────────────────────────────────────────────
// Breaks a topic (or a pasted source, if the input is long enough to look
// like one) into atomic claims and persists each with a real embedding.
function buildRecoveryContinuation(partialContent?: string): string {
  if (!partialContent || partialContent.length === 0) return ''
  return `\n\nCONTINUATION REQUEST: Your previous response was interrupted unexpectedly. Continue exactly where you left off. Do NOT restart, summarize, or repeat any previous content. Do NOT apologize or acknowledge the interruption. The last content sent before the interruption was:\n\n${partialContent.slice(-500)}\n\nContinue from the exact point this was cut off.`
}

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
      prompt: `${isSourceText ? 'Source text' : 'Topic'}: ${trimmed}${memoryContext}\n\nExtract the claims now.${ctx.isRecovery ? buildRecoveryContinuation(ctx.partialContent) : ''}`,
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

// Enemy Claims (Freebuff): surfaceNextDue already picks any status='active'
// claim regardless of is_enemy, so enemy claims are ALREADY in probe rotation
// with no logic change — this just carries the flag through to the response so
// the eventual feature can render/score a surfaced enemy differently. Selected
// defensively (is_enemy is migration 020) so probe keeps working before 020.
async function selectDueClaim(userId: string, nowIso: string) {
  const run = (cols: string) =>
    supabase
      .from('claims')
      .select(cols)
      .eq('user_id', userId)
      .eq('status', 'active')
      .or(`next_probe_at.is.null,next_probe_at.lte.${nowIso}`)
      .order('next_probe_at', { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle()

  const withEnemy = await run('id, content, topic, is_enemy')
  if (!withEnemy.error) {
    const d = withEnemy.data as unknown as { id: string; content: string; topic: string; is_enemy: boolean | null } | null
    return { data: d ? { ...d, is_enemy: d.is_enemy ?? false } : null, error: null }
  }
  const fallback = await run('id, content, topic')
  const d = fallback.data as unknown as { id: string; content: string; topic: string } | null
  return { data: d ? { ...d, is_enemy: false } : null, error: fallback.error }
}

async function surfaceNextDue(ctx: LearnOpsContext): Promise<LearnOpsResult> {
  const nowIso = new Date().toISOString()
  const { data: due, error } = await selectDueClaim(ctx.userId, nowIso)

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
    pending_probe: { claim_id: due.id, content: due.content, topic: due.topic, asked_at: askedAt, is_enemy: due.is_enemy },
  }))
  if (!persisted) console.error('[learn-ops] failed to persist pending_probe for session', ctx.sessionId)

  return {
    output: `Explain in your own words: ${due.content}`,
    exitCode: 0,
    data: { claim_id: due.id, content: due.content, topic: due.topic, is_enemy: due.is_enemy },
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

// ════════════════════════════════════════════════════════════════════════
// Core verbs — gap / defend / teach / retire. See LEARN.md for the
// claim_events each writes (defense_attempted, explanation_graded) and the
// teach-gated retire rule.
// ════════════════════════════════════════════════════════════════════════

interface ResolvedClaim {
  id: string
  content: string
  topic: string
  half_life: number
  status: string
}

// Resolve a verb's free-text argument to one of the user's claims. Exact-ish
// first (substring ilike, for when the user pastes the claim), then embedding
// nearest-neighbor (for a paraphrase), reusing the Map's similarity helpers —
// no new similarity system. With no argument, falls back to the most-due
// active claim (same selection probe uses).
async function resolveClaim(userId: string, argText: string): Promise<ResolvedClaim | null> {
  const t = argText.trim()

  if (t) {
    const like = t.replace(/[%_]/g, '')
    if (like.length >= 3) {
      const { data } = await supabase
        .from('claims')
        .select('id, content, topic, half_life, status')
        .eq('user_id', userId)
        .ilike('content', `%${like}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) return data as ResolvedClaim
    }

    // Embedding fallback: nearest claim to the argument text above a floor.
    const queryEmbedding = await generateEmbedding(t, 'query')
    if (queryEmbedding) {
      const { data: all } = await supabase
        .from('claims')
        .select('id, content, topic, half_life, status, embedding')
        .eq('user_id', userId)
        .neq('status', 'retired')
      let best: ResolvedClaim | null = null
      let bestSim = 0.5 // floor — below this it isn't really "this claim"
      for (const c of (all ?? []) as (ResolvedClaim & { embedding: unknown })[]) {
        const emb = parseEmbedding(c.embedding)
        if (!emb) continue
        const sim = cosineSimilarity(queryEmbedding, emb)
        if (sim > bestSim) { bestSim = sim; best = { id: c.id, content: c.content, topic: c.topic, half_life: c.half_life, status: c.status } }
      }
      return best
    }
    return null
  }

  // No argument: most-due active claim.
  const nowIso = new Date().toISOString()
  const { data } = await supabase
    .from('claims')
    .select('id, content, topic, half_life, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .or(`next_probe_at.is.null,next_probe_at.lte.${nowIso}`)
    .order('next_probe_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle()
  return (data as ResolvedClaim) ?? null
}

// ── gap ─────────────────────────────────────────────────────────────────
// Surface the topic with the weakest coverage: lowest average live strength,
// tie-broken (if Fog of War / claim_activity data exists) toward the topic
// that's gone coldest. Read-only — writes no events.
interface GapClaimRow {
  id: string
  content: string
  topic: string
  strength: number
  half_life: number
  last_probed_at: string | null
  created_at: string
}

async function gapAnalysis(ctx: LearnOpsContext): Promise<LearnOpsResult> {
  const { data, error } = await supabase
    .from('claims')
    .select('id, content, topic, strength, half_life, last_probed_at, created_at')
    .eq('user_id', ctx.userId)
    .eq('status', 'active')
  if (error) {
    console.error('[learn-ops] gap query failed:', error)
    return { output: `gap: could not read claims — ${error.message}`, exitCode: 1 }
  }
  const claims = (data ?? []) as GapClaimRow[]
  if (claims.length === 0) {
    return { output: 'gap: nothing learned yet — run learn "<topic>" to start building claims.', exitCode: 0 }
  }

  // Group by topic; average the LIVE strength (never the stored column).
  const byTopic = new Map<string, { total: number; count: number; weakest: { content: string; s: number } }>()
  for (const c of claims) {
    const s = computeStrength(
      { strength: c.strength, half_life: c.half_life, last_probed_at: c.last_probed_at, created_at: c.created_at } satisfies ClaimForStrength,
      [],
    )
    const topic = c.topic || '(untopiced)'
    const g = byTopic.get(topic) ?? { total: 0, count: 0, weakest: { content: c.content, s: 1 } }
    g.total += s
    g.count += 1
    if (s < g.weakest.s) g.weakest = { content: c.content, s }
    byTopic.set(topic, g)
  }

  const ranked = [...byTopic.entries()]
    .map(([topic, g]) => ({ topic, avg: g.total / g.count, count: g.count, weakest: g.weakest.content }))
    .sort((a, b) => a.avg - b.avg)
  const worst = ranked[0]

  // Fog tie-break: if claim_activity exists, note the coldest topic too.
  let coldNote = ''
  const { data: act } = await supabase.from('claim_activity').select('claim_id, last_touched_at').eq('user_id', ctx.userId)
  if (act && act.length > 0) {
    const claimTopic = new Map(claims.map((c) => [c.id, c.topic || '(untopiced)']))
    const topicCold = new Map<string, number>()
    for (const row of act as { claim_id: string; last_touched_at: string }[]) {
      const topic = claimTopic.get(row.claim_id)
      if (!topic) continue
      const ms = new Date(row.last_touched_at).getTime()
      const prev = topicCold.get(topic)
      if (prev === undefined || ms < prev) topicCold.set(topic, ms)
    }
    const coldest = [...topicCold.entries()].sort((a, b) => a[1] - b[1])[0]
    if (coldest && coldest[0] !== worst.topic) {
      coldNote = `\nColdest (least recently touched): "${coldest[0]}" — last active ${new Date(coldest[1]).toLocaleDateString()}.`
    }
  }

  const pct = Math.round(worst.avg * 100)
  return {
    output: `Weakest area: "${worst.topic}" — ${pct}% average retention across ${worst.count} claim${worst.count === 1 ? '' : 's'}. Lowest: "${worst.weakest}".${coldNote}\n\nShore it up: learn "${worst.topic}"`,
    exitCode: 0,
    data: { topic: worst.topic, avg_strength: worst.avg, suggested_learn: worst.topic, ranked },
  }
}

// ── defend ──────────────────────────────────────────────────────────────
// Two-phase: surface the strongest counterargument to a claim, then require a
// rebuttal. Logs both sides as a `defense_attempted` event — payload shaped so
// a future Argument Ledger can reconstruct the exchange without a schema change.
const DEFEND_SYSTEM_PROMPT = `You are a sharp, fair intellectual opponent. Given one claim the user believes, produce the SINGLE strongest good-faith counterargument against it — the objection a smart skeptic would actually raise. Be concrete and specific to THIS claim, not a generic "have you considered the opposite". No hedging, no "on the other hand", no restating the claim. 2-4 sentences. Output the counterargument text only, nothing else.`

async function defendClaim(ctx: LearnOpsContext, arg: string): Promise<LearnOpsResult> {
  const payload = await loadSessionPayload<LearnSessionPayload>(ctx.sessionId, ctx.userId)
  const pending = payload?.pending_defense
  const rebuttal = arg.trim()

  if (pending && rebuttal) return recordDefense(ctx, pending, rebuttal)
  if (pending && !rebuttal) {
    return { output: `Still defending: "${pending.claim_content}"\n\nCounterargument: ${pending.counterargument}\n\nArgue back.`, exitCode: 0, data: { claim_id: pending.claim_id } }
  }

  const claim = await resolveClaim(ctx.userId, arg)
  if (!claim) {
    return { output: 'defend: which claim? Give me a claim to attack, e.g. defend "spaced repetition beats cramming".', exitCode: 1 }
  }

  try {
    const client = nimClientFor(ctx.model)
    const { text } = await generateText({
      model: client.chat(ctx.model ?? DEFAULT_NIM_MODEL),
      system: DEFEND_SYSTEM_PROMPT,
      prompt: `Claim: ${claim.content}\n\nGive your strongest counterargument.${ctx.isRecovery ? buildRecoveryContinuation(ctx.partialContent) : ''}`,
      temperature: 0.7,
      maxOutputTokens: 500,
      timeout: 40_000,
      maxRetries: 0,
    })
    const counterargument = text.trim()
    if (!counterargument) return { output: 'defend: could not generate a counterargument — try again.', exitCode: 1 }

    const askedAt = new Date().toISOString()
    await casUpdateSessionPayload<LearnSessionPayload>(ctx.sessionId, ctx.userId, () => ({
      pending_defense: { claim_id: claim.id, claim_content: claim.content, counterargument, asked_at: askedAt },
    }))

    return {
      output: `Defending: "${claim.content}"\n\nCounterargument: ${counterargument}\n\nArgue back — why does your claim still hold?`,
      exitCode: 0,
      data: { claim_id: claim.id, counterargument },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { output: `defend: ${msg}`, exitCode: 1 }
  }
}

async function recordDefense(
  ctx: LearnOpsContext,
  pending: NonNullable<LearnSessionPayload['pending_defense']>,
  rebuttal: string,
): Promise<LearnOpsResult> {
  // Payload contract for a future Argument Ledger: claim_content + the two
  // sides + a `rounds` array (one round today, but shaped for multi-round).
  const { error } = await supabase.from('claim_events').insert({
    claim_id: pending.claim_id,
    event_type: 'defense_attempted',
    payload: {
      claim_content: pending.claim_content,
      counterargument: pending.counterargument,
      rebuttal,
      rounds: [{ side: 'counter', text: pending.counterargument }, { side: 'rebuttal', text: rebuttal }],
      asked_at: pending.asked_at,
    },
  })
  if (error) {
    console.error('[learn-ops] defense_attempted insert failed:', error)
    return { output: `defend: failed to log the exchange — ${error.message}`, exitCode: 1 }
  }
  await casUpdateSessionPayload<LearnSessionPayload>(ctx.sessionId, ctx.userId, () => ({ pending_defense: null }))
  return {
    output: `Logged. You defended "${pending.claim_content}" against the counterargument. Both sides are in the record.`,
    exitCode: 0,
    data: { claim_id: pending.claim_id },
  }
}

// ── teach (Feynman gate) ──────────────────────────────────────────────────
// Two-phase: ask the user to explain the claim in their own words, then a
// SEPARATE model call grades the explanation against the claim's actual
// content. Exactly one of three verdicts — SURVIVED / EXPOSED / EVADED —
// logged as `explanation_graded`. A SURVIVED verdict is what `retire` requires.
//
// ⚠ TEACH_GRADING_RUBRIC is a [PAUSE] review item — surfaced in OVERNIGHT.md.
// It's isolated as this one constant so it can be swapped without touching any
// wiring around it.
const TEACH_GRADING_RUBRIC = `You are grading whether a learner truly understands a specific claim, Feynman-style: they were asked to explain it in their own words. Grade their explanation against the claim's ACTUAL content — not against how eloquent or confident it sounds.

Return exactly one verdict:

- SURVIVED — The explanation is accurate AND demonstrates real understanding of the claim's core mechanism or point. They could only have written this if they actually get it. Minor imprecision is fine as long as the central idea is correct and clearly grasped.
- EXPOSED — The explanation reveals a genuine misunderstanding: it states something false about the claim, contradicts it, or gets the core mechanism wrong. A confidently wrong explanation is EXPOSED.
- EVADED — The explanation dodges the actual point: vague, circular, merely restates the claim in other words, defines around it, or stays so general it never engages the specific mechanism. No clear factual error, but no demonstrated understanding either.

Decision order: if there is a clear factual error about the claim → EXPOSED. Else if the core point is actually explained → SURVIVED. Else → EVADED.

Output JSON only: { "verdict": "SURVIVED" | "EXPOSED" | "EVADED", "rationale": "<one sentence, specific to what they actually wrote>" }`

async function teachClaim(ctx: LearnOpsContext, arg: string): Promise<LearnOpsResult> {
  const payload = await loadSessionPayload<LearnSessionPayload>(ctx.sessionId, ctx.userId)
  const pending = payload?.pending_teach
  const explanation = arg.trim()

  if (pending && explanation) return gradeExplanation(ctx, pending, explanation)
  if (pending && !explanation) {
    return { output: `Still teaching: explain "${pending.claim_content}" in your own words.`, exitCode: 0, data: { claim_id: pending.claim_id } }
  }

  const claim = await resolveClaim(ctx.userId, arg)
  if (!claim) {
    return { output: 'teach: which claim? Name a claim to teach back, e.g. teach "why the sky is blue".', exitCode: 1 }
  }
  const askedAt = new Date().toISOString()
  await casUpdateSessionPayload<LearnSessionPayload>(ctx.sessionId, ctx.userId, () => ({
    pending_teach: { claim_id: claim.id, claim_content: claim.content, asked_at: askedAt },
  }))
  return {
    output: `Teach it back: explain "${claim.content}" in your own words, as if to someone who's never heard it. Don't just restate it — show the mechanism.`,
    exitCode: 0,
    data: { claim_id: claim.id },
  }
}

const TEACH_VERDICTS = ['SURVIVED', 'EXPOSED', 'EVADED'] as const
type TeachVerdict = typeof TEACH_VERDICTS[number]

async function gradeExplanation(
  ctx: LearnOpsContext,
  pending: NonNullable<LearnSessionPayload['pending_teach']>,
  explanation: string,
): Promise<LearnOpsResult> {
  let verdict: TeachVerdict
  let rationale: string
  try {
    const client = nimClientFor(ctx.model)
    const { text } = await generateText({
      model: client.chat(ctx.model ?? DEFAULT_NIM_MODEL),
      system: TEACH_GRADING_RUBRIC,
      prompt: `Claim (the actual, correct content): ${pending.claim_content}\n\nLearner's explanation: ${explanation}\n\nGrade it.${ctx.isRecovery ? buildRecoveryContinuation(ctx.partialContent) : ''}`,
      temperature: 0.2,
      maxOutputTokens: 400,
      timeout: 40_000,
      maxRetries: 0,
    })
    const parsed = parseJsonLoose<{ verdict: string; rationale: string }>(text)
    const v = (parsed?.verdict ?? '').toUpperCase()
    if (!parsed || !(TEACH_VERDICTS as readonly string[]).includes(v)) {
      // Don't log a bogus verdict — fail cleanly so the user can retry.
      return { output: 'teach: could not grade that explanation cleanly — try explaining again.', exitCode: 1 }
    }
    verdict = v as TeachVerdict
    rationale = (parsed.rationale ?? '').trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { output: `teach: grading failed — ${msg}`, exitCode: 1 }
  }

  const { error } = await supabase.from('claim_events').insert({
    claim_id: pending.claim_id,
    event_type: 'explanation_graded',
    payload: { explanation, verdict, rationale, claim_content: pending.claim_content, asked_at: pending.asked_at },
  })
  if (error) {
    console.error('[learn-ops] explanation_graded insert failed:', error)
    return { output: `teach: graded ${verdict}, but failed to record it — ${error.message}`, exitCode: 1 }
  }
  await casUpdateSessionPayload<LearnSessionPayload>(ctx.sessionId, ctx.userId, () => ({ pending_teach: null }))

  const tail = verdict === 'SURVIVED'
    ? ' This claim is now eligible to retire.'
    : verdict === 'EXPOSED'
      ? ' Worth another learn pass — the mechanism slipped.'
      : ' You talked around it. Try again once you can hit the actual point.'
  return {
    output: `${verdict}: ${rationale}${tail}`,
    exitCode: 0,
    data: { claim_id: pending.claim_id, verdict, rationale },
  }
}

// ── retire ────────────────────────────────────────────────────────────────
// Moves a claim to status='retired' — but ONLY if it has at least one passing
// (SURVIVED) teach in its history. No passing teach → hard refusal. This is
// the one place a claim leaves active rotation by the user's hand.
async function retireClaim(ctx: LearnOpsContext, arg: string): Promise<LearnOpsResult> {
  const claim = await resolveClaim(ctx.userId, arg)
  if (!claim) {
    return { output: 'retire: which claim? Name the claim to retire.', exitCode: 1 }
  }
  if (claim.status === 'retired') {
    return { output: `"${claim.content}" is already retired.`, exitCode: 0, data: { claim_id: claim.id } }
  }

  const { data: graded, error } = await supabase
    .from('claim_events')
    .select('payload')
    .eq('claim_id', claim.id)
    .eq('event_type', 'explanation_graded')
  if (error) {
    console.error('[learn-ops] retire gate query failed:', error)
    return { output: `retire: could not check teach history — ${error.message}`, exitCode: 1 }
  }
  const hasSurvived = (graded ?? []).some((row) => (row.payload as { verdict?: string })?.verdict === 'SURVIVED')
  if (!hasSurvived) {
    return {
      output: `retire: "${claim.content}" hasn't passed a teach yet. Run teach on it and earn a SURVIVED verdict before it can retire.`,
      exitCode: 1,
      data: { claim_id: claim.id, gated: true },
    }
  }

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('claims')
    .update({ status: 'retired', updated_at: now })
    .eq('id', claim.id)
    .eq('user_id', ctx.userId)
  if (updateError) {
    console.error('[learn-ops] retire update failed:', updateError)
    return { output: `retire: failed to retire — ${updateError.message}`, exitCode: 1 }
  }
  await supabase.from('claim_events').insert({ claim_id: claim.id, event_type: 'claim_retired', payload: { claim_content: claim.content } })
  return { output: `Retired "${claim.content}". It survived a teach and is out of active rotation.`, exitCode: 0, data: { claim_id: claim.id, status: 'retired' } }
}
