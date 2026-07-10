import { generateText } from 'ai'
import { supabase } from './supabase'
import { generateEmbedding } from './embeddings'
import { nimClientFor, DEFAULT_NIM_MODEL, parseJsonLoose } from './nim'
import { domainForType, type FailureDomain } from './synthesis'
import type {
  ResourceType,
  CheckinPayload,
  WorkoutPayload,
  RacePacePayload,
  CountdownPayload,
} from './resources'

// ─────────────────────────────────────────────────────────────────────────
// Root Cause: assemble the real data around a failure, encode its "shape" as a
// normalized failure signature (for future pattern matching), and expose the
// evidence pack the 5-Whys interview cites at every layer.
// ─────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000
export const EVIDENCE_WINDOW_DAYS = 21

export interface EvidenceCard {
  label: string
  detail: string
  domain: FailureDomain
}

export interface EvidencePack {
  windowStart: string
  windowEnd: string
  domain: FailureDomain
  cards: EvidenceCard[]
  text: string // flattened rendering for the model
}

interface WindowRow {
  type: ResourceType
  title: string
  payload: Record<string, unknown>
  created_at: string
}

// Which resource types are relevant evidence for a given failure domain. Other
// domains are always included as thin context (the failure may be cross-domain).
function relevantTypes(domain: FailureDomain): ResourceType[] {
  const base: ResourceType[] = ['checkin', 'countdown', 'note']
  switch (domain) {
    case 'training':
      return [...base, 'workout', 'race_pace', 'meal', 'habit_streak']
    case 'academic':
      return [...base, 'grade_calc', 'flashcards', 'article_note', 'bell_schedule']
    case 'project':
      return [...base, 'repo_scan', 'repo_review', 'prompt']
    default:
      return [...base, 'workout', 'race_pace', 'grade_calc', 'repo_review']
  }
}

// Pull every resource in [failureDate - 21d, failureDate] plus a 21-day prior
// baseline window (for relative descriptors in the signature).
export async function assembleEvidence(
  userId: string,
  failureDate: string,
  domain: FailureDomain,
): Promise<EvidencePack> {
  const end = new Date(failureDate + 'T23:59:59').getTime()
  const start = end - EVIDENCE_WINDOW_DAYS * DAY_MS
  const baselineStart = start - EVIDENCE_WINDOW_DAYS * DAY_MS

  const { data, error } = await supabase
    .from('resources')
    .select('type, title, payload, created_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(baselineStart).toISOString())
    .lte('created_at', new Date(end).toISOString())
    .order('created_at', { ascending: true })
  if (error) console.error('[root-cause] evidence query error:', error)

  const all = (data ?? []) as WindowRow[]
  const inWindow = all.filter((r) => new Date(r.created_at).getTime() >= start)
  const baseline = all.filter((r) => new Date(r.created_at).getTime() < start)

  const cards = buildEvidenceCards(inWindow, domain)

  return {
    windowStart: new Date(start).toISOString().slice(0, 10),
    windowEnd: failureDate,
    domain,
    cards,
    text: renderEvidenceText(cards, inWindow, baseline, domain),
  }
}

function byType(rows: WindowRow[], type: ResourceType): WindowRow[] {
  return rows.filter((r) => r.type === type)
}

function buildEvidenceCards(rows: WindowRow[], domain: FailureDomain): EvidenceCard[] {
  const cards: EvidenceCard[] = []
  const wanted = new Set(relevantTypes(domain))

  const checkins = byType(rows, 'checkin')
  if (checkins.length) {
    const ratings = checkins.map((c) => (c.payload as unknown as CheckinPayload).rating)
    cards.push({
      label: 'Check-in ratings',
      detail: `${ratings.join(', ')} over ${checkins.length} day${checkins.length !== 1 ? 's' : ''} before`,
      domain: 'other',
    })
  }

  if (wanted.has('workout')) {
    const workouts = byType(rows, 'workout')
    if (workouts.length) {
      const exercises = workouts.map((w) => (w.payload as unknown as WorkoutPayload).exercise).filter(Boolean)
      cards.push({
        label: 'Workouts logged',
        detail: `${workouts.length} session${workouts.length !== 1 ? 's' : ''}${exercises.length ? ` — ${[...new Set(exercises)].slice(0, 4).join(', ')}` : ''}`,
        domain: 'training',
      })
    }
  }

  if (wanted.has('race_pace')) {
    const races = byType(rows, 'race_pace')
      .map((r) => r.payload as unknown as RacePacePayload)
      .filter((p) => p.mode === 'result')
    if (races.length) {
      cards.push({
        label: 'Race results',
        detail: races.map((r) => `${r.distance} ${r.time_seconds}s${r.is_pr ? ' (PR)' : ''}`).join(', '),
        domain: 'training',
      })
    }
  }

  const events = byType(rows, 'countdown')
  if (events.length) {
    cards.push({
      label: 'Events in window',
      detail: events.map((e) => `${(e.payload as unknown as CountdownPayload).event_name}`).join(', '),
      domain: 'other',
    })
  }

  const notes = byType(rows, 'note')
  if (notes.length) {
    cards.push({
      label: 'Notes captured',
      detail: `${notes.length} note${notes.length !== 1 ? 's' : ''}${notes[0] ? ` — latest: "${String((notes[notes.length - 1].payload as { content?: string }).content ?? '').slice(0, 60)}"` : ''}`,
      domain: 'other',
    })
  }

  if (wanted.has('grade_calc')) {
    const grades = byType(rows, 'grade_calc')
    if (grades.length) {
      cards.push({
        label: 'Grade snapshots',
        detail: `${grades.length} calculation${grades.length !== 1 ? 's' : ''} logged`,
        domain: 'academic',
      })
    }
  }

  if (wanted.has('repo_review')) {
    const reviews = byType(rows, 'repo_review')
    if (reviews.length) {
      cards.push({
        label: 'Code reviews',
        detail: `${reviews.length} review${reviews.length !== 1 ? 's' : ''} run`,
        domain: 'project',
      })
    }
  }

  return cards
}

function renderEvidenceText(
  cards: EvidenceCard[],
  inWindow: WindowRow[],
  baseline: WindowRow[],
  domain: FailureDomain,
): string {
  const lines: string[] = []
  lines.push(`Evidence window: the ${EVIDENCE_WINDOW_DAYS} days before the failure. Domain: ${domain}.`)
  if (cards.length === 0) {
    lines.push('(No logged data in this window — the evidence pack is empty. Do not invent data.)')
  } else {
    for (const c of cards) lines.push(`- ${c.label}: ${c.detail}`)
  }

  // Relative descriptors vs the prior baseline window (for "below/above usual").
  const winWorkouts = inWindow.filter((r) => r.type === 'workout').length
  const baseWorkouts = baseline.filter((r) => r.type === 'workout').length
  if (winWorkouts || baseWorkouts) {
    lines.push(`- Training volume: ${winWorkouts} workouts in-window vs ${baseWorkouts} in the prior ${EVIDENCE_WINDOW_DAYS} days (${relativeDescriptor(winWorkouts, baseWorkouts)}).`)
  }
  return lines.join('\n')
}

function relativeDescriptor(current: number, baseline: number): string {
  if (baseline === 0) return current > 0 ? 'above baseline' : 'no baseline'
  const ratio = current / baseline
  if (ratio < 0.5) return 'well below baseline'
  if (ratio < 0.85) return 'below baseline'
  if (ratio <= 1.15) return 'at baseline'
  return 'above baseline'
}

// ─── Failure signature ──────────────────────────────────────────────────────
// A normalized, bucketed encoding of the 21 days before the failure. Absolute
// values become relative descriptors so April and October can match despite
// different raw numbers. This text is embedded for similarity matching AND
// shown to the user as the human-readable "shape".
export function buildSignatureDescription(
  pack: EvidencePack,
  inWindowSummary: SignatureInputs,
): string {
  const parts: string[] = [`${pack.domain} failure`]

  if (inWindowSummary.checkinLevel && inWindowSummary.checkinSlope) {
    parts.push(`check-ins ${inWindowSummary.checkinSlope}, ${inWindowSummary.checkinLevel}`)
  }
  parts.push(`training volume ${inWindowSummary.trainingVsBaseline}`)
  if (inWindowSummary.streakBroken) parts.push('habit streak broken in window')
  if (inWindowSummary.eventProximityDays !== null) {
    parts.push(`competition ${inWindowSummary.eventProximityDays < 7 ? '<7' : '<14'} days out`)
  }
  if (inWindowSummary.quietTools.length) {
    parts.push(`${inWindowSummary.quietTools.join(' & ')} went quiet`)
  }
  return parts.join('; ')
}

export interface SignatureInputs {
  checkinLevel: 'low' | 'mid' | 'high' | null
  checkinSlope: 'falling' | 'flat' | 'rising' | null
  trainingVsBaseline: 'well below baseline' | 'below baseline' | 'at baseline' | 'above baseline' | 'no baseline'
  streakBroken: boolean
  eventProximityDays: number | null
  quietTools: string[]
}

// Derive the bucketed signature inputs from the raw window. Kept deterministic
// (no LLM) so the same failure always produces the same shape.
export async function computeSignatureInputs(
  userId: string,
  failureDate: string,
  domain: FailureDomain,
): Promise<SignatureInputs> {
  const end = new Date(failureDate + 'T23:59:59').getTime()
  const start = end - EVIDENCE_WINDOW_DAYS * DAY_MS
  const baselineStart = start - EVIDENCE_WINDOW_DAYS * DAY_MS

  const { data } = await supabase
    .from('resources')
    .select('type, payload, created_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(baselineStart).toISOString())
    .lte('created_at', new Date(end).toISOString())
    .order('created_at', { ascending: true })

  const all = (data ?? []) as WindowRow[]
  const inWindow = all.filter((r) => new Date(r.created_at).getTime() >= start)
  const baseline = all.filter((r) => new Date(r.created_at).getTime() < start)

  // Check-in level + slope.
  const ratings = inWindow
    .filter((r) => r.type === 'checkin')
    .map((r) => (r.payload as unknown as CheckinPayload).rating)
    .filter((n) => typeof n === 'number')
  let checkinLevel: SignatureInputs['checkinLevel'] = null
  let checkinSlope: SignatureInputs['checkinSlope'] = null
  if (ratings.length >= 2) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length
    checkinLevel = avg <= 2.4 ? 'low' : avg >= 3.6 ? 'high' : 'mid'
    const mid = Math.floor(ratings.length / 2)
    const firstAvg = ratings.slice(0, mid).reduce((a, b) => a + b, 0) / Math.max(1, mid)
    const lastAvg = ratings.slice(ratings.length - mid).reduce((a, b) => a + b, 0) / Math.max(1, mid)
    const d = lastAvg - firstAvg
    checkinSlope = d > 0.5 ? 'rising' : d < -0.5 ? 'falling' : 'flat'
  }

  // Training volume vs baseline.
  const winWorkouts = inWindow.filter((r) => r.type === 'workout').length
  const baseWorkouts = baseline.filter((r) => r.type === 'workout').length
  const trainingVsBaseline = relativeDescriptor(winWorkouts, baseWorkouts) as SignatureInputs['trainingVsBaseline']

  // Streak break: any habit_streak entry in window with streak === 0/1 after a
  // higher one earlier (crude but deterministic).
  const streaks = inWindow
    .filter((r) => r.type === 'habit_streak')
    .map((r) => (r.payload as { streak?: number }).streak ?? 0)
  const streakBroken = streaks.length >= 2 && Math.max(...streaks) >= 3 && streaks[streaks.length - 1] <= 1

  // Event proximity: closest countdown event to the failure date.
  const events = inWindow
    .filter((r) => r.type === 'countdown')
    .map((r) => (r.payload as unknown as CountdownPayload).event_date)
    .map((d) => Math.abs(new Date(d).getTime() - end) / DAY_MS)
  const eventProximityDays = events.length ? Math.round(Math.min(...events)) : null

  // Quiet tools: types active in baseline but silent in window.
  const winTypes = new Set(inWindow.map((r) => r.type))
  const baseTypes = new Set(baseline.map((r) => r.type))
  const quietTools = [...baseTypes]
    .filter((t) => !winTypes.has(t) && domainForType(t) === domain)
    .slice(0, 3)

  return {
    checkinLevel,
    checkinSlope,
    trainingVsBaseline,
    streakBroken,
    eventProximityDays,
    quietTools,
  }
}

// ─── Pattern matching ───────────────────────────────────────────────────────
export interface SignatureMatch {
  id: string
  title: string
  rootCause: string
  failureDate: string
  when: string
  similarity: number
}

// Calibrated for nv-embedqa-e5-v5's score scale (its cosine similarities run
// well below bge-m3's; 0.86 would never match). Signatures are compared
// passage-to-passage; same-shape failures land roughly 0.6+. Tune with data.
const MATCH_THRESHOLD = 0.6

export async function matchPastFailures(
  userId: string,
  signatureDescription: string,
): Promise<SignatureMatch[]> {
  const embedding = await generateEmbedding(signatureDescription)
  if (!embedding) return []

  const { data, error } = await supabase.rpc('match_failure_signatures', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: MATCH_THRESHOLD,
    match_count: 3,
    p_user_id: userId,
  })
  if (error) {
    console.error('[root-cause] match RPC error:', error)
    return []
  }

  return (data ?? []).map((row: { id: string; title: string; payload: Record<string, unknown>; created_at: string; similarity: number }) => {
    const p = row.payload as { root_cause?: string; failure_date?: string }
    return {
      id: row.id,
      title: row.title,
      rootCause: p.root_cause ?? '',
      failureDate: p.failure_date ?? row.created_at.slice(0, 10),
      when: row.created_at.slice(0, 10),
      similarity: row.similarity,
    }
  })
}

export { MATCH_THRESHOLD }

// ─── Interview runner ───────────────────────────────────────────────────────
// One model call per "why" layer, with the full interview history + evidence
// pack as context. Returns the model's structured turn (probe/pushback/
// synthesis).

const INTERVIEW_SYSTEM_PROMPT = `You are running a 5-Whys root-cause investigation with Henry about a failure
he logged. You have: the failure description and date, the current layer
number, the causal chain accepted so far, the full interview history, and an
evidence pack of his real logged data from the three weeks before the failure.

Your job this turn: settle the current layer — propose ONE candidate cause for
why the layer above it happened, supported by specific evidence.

Rules:
- Every candidate cause cites at least one concrete data point from the
  evidence pack — dates, numbers, gaps. If no data in the pack supports any
  deeper cause, say exactly that instead of inventing one.
- If Henry rejected your last candidate, propose a genuinely different cause,
  not a rewording — use his rejection reason to redirect.
- If Henry proposes his own cause, test it against the data. Data contradicts
  it: push back and show the contradiction plainly. Data supports it: accept,
  move down. Data is silent: accept it as his call, marked unverified.
- Never accept "I was just tired," "bad luck," or a restatement of the failure
  as a cause. Ask what produced the tiredness; ask what left the system
  exposed to the luck.
- Direct, not therapeutic. No reassurance padding. Short. Cite data, not vibes.
- Know when to stop: if the current cause is genuinely external and
  uncontrollable — and the data agrees — say so plainly and end the chain
  there. Do not manufacture a lesson. Otherwise stop at layer 5 or when Henry
  says it's the root.
- At synthesis: produce the full chain surface->root, a one-sentence root cause
  statement, and 1-2 preventions that change a system, a default, or an
  environment — never willpower ("decide harder" is banned).

Output JSON only, exactly one of:
{ "phase": "probe", "layer": n, "candidate_cause": string,
  "evidence": string[], "question_to_henry": string }
{ "phase": "pushback", "layer": n, "response_to_henry": string,
  "evidence": string[], "candidate_cause": string }
{ "phase": "synthesis",
  "causal_chain": [{ "layer": n, "cause": string, "evidence": string[] }],
  "root_cause": string, "preventions": string[], "external_root": boolean }`

export interface InterviewMessage {
  role: 'enry' | 'henry'
  content: string
}

export interface InterviewTurnInput {
  failureDescription: string
  failureDate: string
  domain: FailureDomain
  evidenceText: string
  currentLayer: number
  acceptedChain: { layer: number; cause: string }[]
  history: InterviewMessage[]
  forceSynthesis?: boolean // Henry said "that's the root"
}

export type InterviewTurn =
  | { phase: 'probe'; layer: number; candidate_cause: string; evidence: string[]; question_to_henry: string }
  | { phase: 'pushback'; layer: number; response_to_henry: string; evidence: string[]; candidate_cause: string }
  | {
      phase: 'synthesis'
      causal_chain: { layer: number; cause: string; evidence: string[] }[]
      root_cause: string
      preventions: string[]
      external_root: boolean
    }

export async function runInterviewTurn(input: InterviewTurnInput): Promise<InterviewTurn | null> {
  const transcript =
    input.history.length === 0
      ? '(interview just started — this is the first layer)'
      : input.history.map((m) => `${m.role === 'enry' ? 'enry' : 'Henry'}: ${m.content}`).join('\n')

  const chainSoFar =
    input.acceptedChain.length === 0
      ? '(none accepted yet)'
      : input.acceptedChain.map((c) => `  L${c.layer}: ${c.cause}`).join('\n')

  const userPrompt = `## Failure
${input.failureDescription} (logged ${input.failureDate})

## Evidence pack
${input.evidenceText}

## Causal chain accepted so far
${chainSoFar}

## Interview history
${transcript}

## This turn
Current layer: ${input.currentLayer} of 5.
${input.forceSynthesis ? 'Henry says this is the root. Produce the SYNTHESIS now.' : input.currentLayer > 5 ? 'You have reached layer 5. Produce the SYNTHESIS now.' : 'Settle this layer.'}`

  try {
    const client = nimClientFor()
    const { text } = await generateText({
      model: client.chat(DEFAULT_NIM_MODEL),
      system: INTERVIEW_SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.5,
      maxOutputTokens: 1200,
    })
    return parseJsonLoose<InterviewTurn>(text)
  } catch (err) {
    console.error('[root-cause] interview turn threw:', err)
    return null
  }
}

// Embed a signature description for storage on the root_cause resource.
export async function embedSignature(description: string): Promise<number[] | null> {
  return generateEmbedding(description)
}
