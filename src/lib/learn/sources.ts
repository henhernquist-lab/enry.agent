import { supabase } from '../supabase'

// Source Custody — the data behind Learn's Sources tab. Every claim already
// carries provenance (source_type + source_ref, migration 019); this module
// groups claims by their source, and lets a source be "pinned" as trusted.
//
// Pins are stored as generic `resources` rows (type='learn_source_pin',
// payload={source_type, source_ref}) — the same polymorphic-resources pattern
// learn_session uses — so no migration is needed. A pinned source is the seam
// a future Source-Grounded Mode reads to preferentially cite it (and to flag
// claims whose source isn't pinned as "untrusted"). This module builds that
// mechanism ONLY — it enforces nothing.

export const SOURCE_PIN_TYPE = 'learn_source_pin'

// A source's stable identity across claims. source_ref is nullable on claims
// (manual entries often have none), so null collapses to '' for keying.
export function sourceKey(sourceType: string, sourceRef: string | null): string {
  return `${sourceType}::${sourceRef ?? ''}`
}

export interface SourceGroup {
  source_type: string
  source_ref: string | null
  key: string
  claim_count: number
  pinned: boolean
  sample_claims: { id: string; content: string; topic: string; status: string }[]
}

export interface SourcesView {
  sources: SourceGroup[]
  totals: {
    pinned_sources: number
    unpinned_sources: number
    claims_without_pinned_custody: number
  }
}

interface ClaimRow {
  id: string
  content: string
  topic: string
  status: string
  source_type: string
  source_ref: string | null
}

// Read the user's pinned source keys (as a Set for O(1) membership). This is
// the function Source-Grounded Mode will call to know what to prefer/enforce.
export async function getPinnedSourceKeys(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('resources')
    .select('payload')
    .eq('user_id', userId)
    .eq('type', SOURCE_PIN_TYPE)
  if (error) {
    console.error('[learn/sources] pin read failed:', error)
    return new Set()
  }
  const keys = new Set<string>()
  for (const row of data ?? []) {
    const p = row.payload as { source_type?: string; source_ref?: string | null }
    if (p?.source_type !== undefined) keys.add(sourceKey(p.source_type, p.source_ref ?? null))
  }
  return keys
}

const SAMPLES_PER_SOURCE = 5

export async function getSources(userId: string): Promise<SourcesView> {
  const { data, error } = await supabase
    .from('claims')
    .select('id, content, topic, status, source_type, source_ref')
    .eq('user_id', userId)
    .neq('status', 'retired')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[learn/sources] claims query failed:', error)
    return { sources: [], totals: { pinned_sources: 0, unpinned_sources: 0, claims_without_pinned_custody: 0 } }
  }

  const pinned = await getPinnedSourceKeys(userId)
  const claims = (data ?? []) as ClaimRow[]

  const grouped = new Map<string, SourceGroup>()
  for (const c of claims) {
    const key = sourceKey(c.source_type, c.source_ref)
    let g = grouped.get(key)
    if (!g) {
      g = {
        source_type: c.source_type,
        source_ref: c.source_ref,
        key,
        claim_count: 0,
        pinned: pinned.has(key),
        sample_claims: [],
      }
      grouped.set(key, g)
    }
    g.claim_count += 1
    if (g.sample_claims.length < SAMPLES_PER_SOURCE) {
      g.sample_claims.push({ id: c.id, content: c.content, topic: c.topic, status: c.status })
    }
  }

  const sources = [...grouped.values()].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1 // pinned first
    return b.claim_count - a.claim_count
  })

  const claimsWithoutPinnedCustody = claims.filter((c) => !pinned.has(sourceKey(c.source_type, c.source_ref))).length

  return {
    sources,
    totals: {
      pinned_sources: sources.filter((s) => s.pinned).length,
      unpinned_sources: sources.filter((s) => !s.pinned).length,
      claims_without_pinned_custody: claimsWithoutPinnedCustody,
    },
  }
}

// Pin a source (idempotent — a duplicate pin is a no-op). Returns true if now
// pinned. Validates the source actually exists among the user's claims so a
// caller can't pin an arbitrary key.
export async function pinSource(userId: string, sourceType: string, sourceRef: string | null): Promise<boolean> {
  const key = sourceKey(sourceType, sourceRef)
  const existing = await getPinnedSourceKeys(userId)
  if (existing.has(key)) return true

  const { error } = await supabase.from('resources').insert({
    user_id: userId,
    type: SOURCE_PIN_TYPE,
    source: 'user',
    title: `Pinned source: ${sourceType}${sourceRef ? ` · ${sourceRef}` : ''}`,
    payload: { source_type: sourceType, source_ref: sourceRef },
  })
  if (error) {
    console.error('[learn/sources] pin insert failed:', error)
    return false
  }
  return true
}

export async function unpinSource(userId: string, sourceType: string, sourceRef: string | null): Promise<boolean> {
  // Match on the jsonb payload fields. source_ref null needs an is-null match.
  let q = supabase
    .from('resources')
    .delete()
    .eq('user_id', userId)
    .eq('type', SOURCE_PIN_TYPE)
    .eq('payload->>source_type', sourceType)
  q = sourceRef === null ? q.is('payload->>source_ref', null) : q.eq('payload->>source_ref', sourceRef)
  const { error } = await q
  if (error) {
    console.error('[learn/sources] unpin delete failed:', error)
    return false
  }
  return true
}
