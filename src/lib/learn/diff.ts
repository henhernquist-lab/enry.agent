import { generateText } from 'ai'
import { nimClientFor, DEFAULT_NIM_MODEL, parseJsonLoose } from '../nim'
import { generateEmbedding } from '../embeddings'
import { supabase } from '../supabase'
import { computeStrength } from './strength'
import { cosineSimilarity, parseEmbedding } from './map'

// Knowledge Diff — the flagship. Given a target topic, diff what mastering it
// REQUIRES against what the user actually holds in claims:
//   • known      — a facet covered by a strong claim
//   • half_known  — covered but weak/decayed, or with a recent failed teach
//   • missing     — no claim covers this facet at all
//
// The target's "semantic surface" (its facets) comes from one LLM call; the
// coverage check is pure embedding similarity against the user's claim vectors
// — the SAME pipeline the Map uses, no new similarity system.

export type FacetStatus = 'known' | 'half_known' | 'missing'

export interface DiffFacet {
  facet: string
  why: string
  status: FacetStatus
  matched_claim: { id: string; content: string; strength: number; similarity: number } | null
}

export interface KnowledgeDiff {
  target: string
  facets: DiffFacet[]
  coverage: { known: number; half_known: number; missing: number; total: number; pct: number }
  computed_at: string
  error?: string
}

// Similarity floor for "this facet is covered by this claim at all". Calibrated
// live against nv-embedqa-e5-v5's query-vs-passage scores, which are COMPRESSED:
// a near-identical facet↔claim pair scores ~0.50, a related-but-different facet
// ~0.25-0.30, unrelated ~0.10-0.19. 0.40 sits in the gap — catches genuine
// (even paraphrased) coverage, rejects merely-adjacent facets. Tunable.
const FACET_MATCH_SIM = 0.4
// Strength at/above which a covered facet counts as fully known.
const STRONG_STRENGTH = 0.6
// A teach failure this recent forces a covered facet down to half_known even
// if strength is still high.
const RECENT_FAILURE_DAYS = 21

const SURFACE_SYSTEM_PROMPT = `You map the essential surface of a topic: the distinct sub-areas someone MUST understand to genuinely know it. Break the given topic into 8-14 facets — each a specific, standalone sub-area (a mechanism, distinction, cause, application), not a vague heading. Order roughly foundational → advanced.

Output JSON only:
{ "facets": [{ "facet": "<short specific sub-area, 2-6 words>", "why": "<one clause: what understanding it requires>" }] }`

interface ClaimVec {
  id: string
  content: string
  strength: number
  half_life: number
  last_probed_at: string | null
  created_at: string
  embedding: number[]
}

function buildRecoveryContinuation(partialContent?: string): string {
  if (!partialContent || partialContent.length === 0) return ''
  return `\n\nCONTINUATION REQUEST: Your previous response was interrupted unexpectedly. Continue exactly where you left off. Do NOT restart, summarize, or repeat any previous content. Do NOT apologize or acknowledge the interruption. The last content sent before the interruption was:\n\n${partialContent.slice(-500)}\n\nContinue from the exact point this was cut off.`
}

export async function computeKnowledgeDiff(
  userId: string,
  googleId: string | undefined,
  target: string,
  model?: string,
  isRecovery?: boolean,
  partialContent?: string,
): Promise<KnowledgeDiff> {
  const trimmed = target.trim()
  const now = new Date().toISOString()
  const empty = (error?: string): KnowledgeDiff => ({
    target: trimmed, facets: [], coverage: { known: 0, half_known: 0, missing: 0, total: 0, pct: 0 }, computed_at: now, error,
  })
  if (!trimmed) return empty('Give a target topic to diff against.')

  // 1. Target → semantic surface (facets).
  let facetDefs: { facet: string; why: string }[]
  try {
    const client = nimClientFor(model)
    const { text } = await generateText({
      model: client.chat(model ?? DEFAULT_NIM_MODEL),
      system: SURFACE_SYSTEM_PROMPT,
      prompt: `Topic: ${trimmed}\n\nMap its essential facets now.${isRecovery ? buildRecoveryContinuation(partialContent) : ''}`,
      temperature: 0.3, maxOutputTokens: 1200, timeout: 45_000, maxRetries: 0,
    })
    const parsed = parseJsonLoose<{ facets: { facet: string; why: string }[] }>(text)
    if (!parsed || !Array.isArray(parsed.facets) || parsed.facets.length === 0) {
      return empty('Could not map that topic — try a more specific target.')
    }
    facetDefs = parsed.facets.filter((f) => f.facet?.trim())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return empty(`Diff failed while mapping the topic: ${msg}`)
  }

  // 2. Load the user's non-retired claims with embeddings + live strength.
  const { data: claimRows } = await supabase
    .from('claims')
    .select('id, content, strength, half_life, last_probed_at, created_at, embedding')
    .eq('user_id', userId)
    .neq('status', 'retired')
  const claims: ClaimVec[] = []
  for (const c of claimRows ?? []) {
    const emb = parseEmbedding((c as { embedding: unknown }).embedding)
    if (emb) claims.push({ ...(c as Omit<ClaimVec, 'embedding'>), embedding: emb })
  }

  // Recent teach failures — matched claims with these go half_known.
  const failedClaimIds = await recentlyFailedClaimIds(claims.map((c) => c.id))

  // 3. Classify each facet by nearest claim.
  const facets: DiffFacet[] = []
  for (const def of facetDefs) {
    // Embed facet + its "why" clause together — a terse 2-3 word label alone
    // embeds too weakly under the asymmetric model to match a full claim
    // sentence; the extra context lifts genuine matches above the floor.
    const facetQuery = `${def.facet}. ${def.why ?? ''}`.trim()
    const facetEmb = await generateEmbedding(facetQuery, 'query')
    let best: { c: ClaimVec; sim: number } | null = null
    if (facetEmb) {
      for (const c of claims) {
        const sim = cosineSimilarity(facetEmb, c.embedding)
        if (!best || sim > best.sim) best = { c, sim }
      }
    }

    let status: FacetStatus
    let matched: DiffFacet['matched_claim'] = null
    if (!best || best.sim < FACET_MATCH_SIM) {
      status = 'missing'
    } else {
      const liveStrength = computeStrength(
        { strength: best.c.strength, half_life: best.c.half_life, last_probed_at: best.c.last_probed_at, created_at: best.c.created_at },
        [],
      )
      const recentlyFailed = failedClaimIds.has(best.c.id)
      status = liveStrength >= STRONG_STRENGTH && !recentlyFailed ? 'known' : 'half_known'
      matched = { id: best.c.id, content: best.c.content, strength: liveStrength, similarity: best.sim }
    }
    facets.push({ facet: def.facet.trim(), why: (def.why ?? '').trim(), status, matched_claim: matched })
  }

  const known = facets.filter((f) => f.status === 'known').length
  const half = facets.filter((f) => f.status === 'half_known').length
  const missing = facets.filter((f) => f.status === 'missing').length
  const total = facets.length
  // Coverage: known = 1, half = 0.5, missing = 0.
  const pct = total === 0 ? 0 : Math.round(((known + half * 0.5) / total) * 100)

  return { target: trimmed, facets, coverage: { known, half_known: half, missing, total, pct }, computed_at: now }
}

// Claim ids with an EXPOSED or EVADED explanation_graded in the last N days.
async function recentlyFailedClaimIds(claimIds: string[]): Promise<Set<string>> {
  if (claimIds.length === 0) return new Set()
  const cutoff = new Date(Date.now() - RECENT_FAILURE_DAYS * 86_400_000).toISOString()
  const { data } = await supabase
    .from('claim_events')
    .select('claim_id, payload, created_at')
    .in('claim_id', claimIds)
    .eq('event_type', 'explanation_graded')
    .gte('created_at', cutoff)
  const failed = new Set<string>()
  for (const e of data ?? []) {
    const v = (e.payload as { verdict?: string })?.verdict
    if (v === 'EXPOSED' || v === 'EVADED') failed.add(e.claim_id as string)
  }
  return failed
}
