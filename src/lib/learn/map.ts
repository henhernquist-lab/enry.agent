import { supabase } from '../supabase'
import { computeStrength } from './strength'

// Map data assembly for Learn's Map tab. Pure-ish server logic (one Supabase
// read + in-memory geometry) kept out of the route so it's independently
// testable. The Map renders every claim as a node positioned by embedding
// similarity — we do NOT ship 1024-dim vectors to the browser; instead we
// compute each node's nearest neighbors here and ship a small link set, and
// the client runs a force layout over those links to get the clustering.

export interface MapNode {
  id: string
  content: string
  topic: string
  strength: number          // 0-1, computed live via strength.ts (never the stored column)
  status: string
  is_enemy: boolean
  last_touched_at: string    // ISO — feeds Fog of War freshness
}

export interface MapLink {
  source: string
  target: string
  similarity: number         // cosine, 0-1 (negatives clamped to 0)
}

export interface MapData {
  nodes: MapNode[]
  links: MapLink[]
  // How the endpoint sourced last_touched_at, surfaced so the client (and
  // tests) can tell whether Fog of War is running on full activity data
  // (the claim_activity view, post-migration-020) or the degraded fallback.
  fog_source: 'claim_activity' | 'fallback'
}

// How many nearest neighbors each node links to. Small K keeps the force
// graph readable (dense all-pairs linking collapses into a hairball) while
// still pulling same-topic claims into visible clusters.
const NEIGHBORS_PER_NODE = 3
// Below this cosine similarity two claims aren't "near" enough to draw a
// spring between them — prevents unrelated claims in a sparse graph from
// being forced together just because they're each other's least-distant.
const MIN_SIMILARITY = 0.55

// pgvector columns come back from supabase-js as a JSON-ish string
// ("[0.1,0.2,...]") most of the time, but can be a real number[] depending on
// driver version — handle both, return null on anything unparseable.
export function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as number[]) : null
    } catch {
      return null
    }
  }
  return null
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

interface RawClaim {
  id: string
  content: string
  topic: string
  strength: number
  half_life: number
  last_probed_at: string | null
  created_at: string
  status: string
  is_enemy: boolean | null
  embedding: unknown
}

// Build the undirected top-K nearest-neighbor link set. Links are deduped so
// an a→b and b→a pair collapses to one edge (keyed by the sorted id pair).
export function buildLinks(
  claims: { id: string; embedding: number[] | null }[],
): MapLink[] {
  const withEmbedding = claims.filter((c): c is { id: string; embedding: number[] } => c.embedding !== null)
  const seen = new Set<string>()
  const links: MapLink[] = []

  for (const a of withEmbedding) {
    const sims = withEmbedding
      .filter((b) => b.id !== a.id)
      .map((b) => ({ id: b.id, sim: cosineSimilarity(a.embedding, b.embedding) }))
      .filter((s) => s.sim >= MIN_SIMILARITY)
      .sort((x, y) => y.sim - x.sim)
      .slice(0, NEIGHBORS_PER_NODE)

    for (const s of sims) {
      const key = a.id < s.id ? `${a.id}|${s.id}` : `${s.id}|${a.id}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ source: a.id, target: s.id, similarity: Math.max(0, s.sim) })
    }
  }
  return links
}

// Fetch last_touched_at per claim from the claim_activity view (migration
// 020). If the view doesn't exist yet, degrade to GREATEST(created_at,
// last_probed_at) computed from the claim rows the caller already has — Fog
// of War then ignores non-probe events (teach/defend) until 020 lands, but
// the Map still works.
async function fetchFogFreshness(
  userId: string,
  claims: RawClaim[],
): Promise<{ map: Map<string, string>; source: MapData['fog_source'] }> {
  const { data, error } = await supabase
    .from('claim_activity')
    .select('claim_id, last_touched_at')
    .eq('user_id', userId)

  if (!error && data) {
    const m = new Map<string, string>()
    for (const row of data as { claim_id: string; last_touched_at: string }[]) {
      m.set(row.claim_id, row.last_touched_at)
    }
    return { map: m, source: 'claim_activity' }
  }

  const m = new Map<string, string>()
  for (const c of claims) {
    const created = c.created_at
    const probed = c.last_probed_at
    m.set(c.id, probed && probed > created ? probed : created)
  }
  return { map: m, source: 'fallback' }
}

// Columns common to migration 019. is_enemy (020) is appended when present.
const BASE_CLAIM_COLS = 'id, content, topic, strength, half_life, last_probed_at, created_at, status, embedding'

export async function getMapData(userId: string): Promise<MapData> {
  // Try selecting is_enemy (migration 020); if the column doesn't exist yet,
  // retry without it and default the flag to false — the Map works pre-020,
  // enemy display is a Freebuff concern that can't render until 020 anyway.
  let claims: RawClaim[]
  const withEnemy = await supabase
    .from('claims')
    .select(`${BASE_CLAIM_COLS}, is_enemy`)
    .eq('user_id', userId)
    .neq('status', 'retired')

  if (withEnemy.error) {
    const fallback = await supabase
      .from('claims')
      .select(BASE_CLAIM_COLS)
      .eq('user_id', userId)
      .neq('status', 'retired')
    if (fallback.error) {
      console.error('[learn/map] claims query failed:', fallback.error)
      return { nodes: [], links: [], fog_source: 'fallback' }
    }
    claims = (fallback.data ?? []).map((c) => ({ ...(c as Omit<RawClaim, 'is_enemy'>), is_enemy: false }))
  } else {
    claims = (withEnemy.data ?? []) as RawClaim[]
  }

  const { map: freshness, source } = await fetchFogFreshness(userId, claims)

  const nodes: MapNode[] = claims.map((c) => ({
    id: c.id,
    content: c.content,
    topic: c.topic,
    strength: computeStrength(
      { strength: c.strength, half_life: c.half_life, last_probed_at: c.last_probed_at, created_at: c.created_at },
      [],
    ),
    status: c.status,
    is_enemy: c.is_enemy ?? false,
    last_touched_at: freshness.get(c.id) ?? c.created_at,
  }))

  const links = buildLinks(
    claims.map((c) => ({ id: c.id, embedding: parseEmbedding(c.embedding) })),
  )

  return { nodes, links, fog_source: source }
}
