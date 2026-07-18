import { supabase } from '../supabase'

// Saveable resources — persist a Map / Diff / Sources view so it reopens
// EXACTLY as it was, not regenerated live. Two stores, chosen by whether the
// saved thing is anchored to a single claim:
//
//   • Multi-claim view artifact (a Diff result, a Map camera + node snapshot,
//     a Sources filter): stored as a generic `resources` row
//     (type='learn_saved_view'). No new table — the repo's polymorphic
//     resources table is the established home (learn_session, source pins),
//     and claim_events can't hold a multi-claim artifact anyway (its claim_id
//     is NOT NULL). See LEARN.md.
//   • Claim-anchored save (bookmarking one claim's state from a detail view):
//     stored as a claim_events row (event_type='resource_saved') on that
//     claim — the claim-derived path the spec calls for.
//
// Either way the payload carries `params` (what to reopen with) + `snapshot`
// (the frozen derived data), so reconstruction reads the snapshot rather than
// recomputing against a claim set that may have changed since.

export const SAVED_VIEW_TYPE = 'learn_saved_view'
export const RESOURCE_SAVED_EVENT = 'resource_saved'

export type LearnViewKind = 'map' | 'diff' | 'sources'
export type SavedViewStore = 'resource' | 'claim_event'

export interface SavedViewInput {
  view: LearnViewKind
  title: string
  params: Record<string, unknown>    // reopen inputs (diff target, map camera, filters)
  snapshot: Record<string, unknown>  // frozen derived data for exact reconstruction
  claimId?: string | null            // present → claim-anchored → claim_events path
}

export interface SavedViewRecord {
  id: string
  store: SavedViewStore
  view: LearnViewKind
  title: string
  params: Record<string, unknown>
  snapshot: Record<string, unknown>
  claim_id: string | null
  saved_at: string
}

interface SavedPayload {
  view: LearnViewKind
  title: string
  params: Record<string, unknown>
  snapshot: Record<string, unknown>
  saved_at: string
}

export async function saveView(userId: string, input: SavedViewInput): Promise<{ id: string; store: SavedViewStore } | null> {
  const payload: SavedPayload = {
    view: input.view,
    title: input.title,
    params: input.params ?? {},
    snapshot: input.snapshot ?? {},
    saved_at: new Date().toISOString(),
  }

  if (input.claimId) {
    // Claim-anchored → claim_events. Ownership is enforced by checking the
    // claim belongs to the user before writing (claim_events has no user_id).
    const { data: claim } = await supabase.from('claims').select('id').eq('id', input.claimId).eq('user_id', userId).maybeSingle()
    if (!claim) return null
    const { data, error } = await supabase
      .from('claim_events')
      .insert({ claim_id: input.claimId, event_type: RESOURCE_SAVED_EVENT, payload })
      .select('id')
      .single()
    if (error) { console.error('[learn/saved-views] claim_event save failed:', error); return null }
    return { id: data.id, store: 'claim_event' }
  }

  const { data, error } = await supabase
    .from('resources')
    .insert({ user_id: userId, type: SAVED_VIEW_TYPE, source: 'user', title: input.title, payload })
    .select('id')
    .single()
  if (error) { console.error('[learn/saved-views] resource save failed:', error); return null }
  return { id: data.id, store: 'resource' }
}

function normalize(id: string, store: SavedViewStore, payload: SavedPayload, claimId: string | null, createdAt: string): SavedViewRecord {
  return {
    id,
    store,
    view: payload?.view,
    title: payload?.title ?? '(untitled)',
    params: payload?.params ?? {},
    snapshot: payload?.snapshot ?? {},
    claim_id: claimId,
    saved_at: payload?.saved_at ?? createdAt,
  }
}

export async function listSavedViews(userId: string): Promise<SavedViewRecord[]> {
  const out: SavedViewRecord[] = []

  const { data: res } = await supabase
    .from('resources')
    .select('id, payload, created_at')
    .eq('user_id', userId)
    .eq('type', SAVED_VIEW_TYPE)
    .order('created_at', { ascending: false })
  for (const r of res ?? []) out.push(normalize(r.id, 'resource', r.payload as SavedPayload, null, r.created_at))

  // Claim-anchored saves — inner-join claims to scope to this user.
  const { data: ev } = await supabase
    .from('claim_events')
    .select('id, claim_id, payload, created_at, claims!inner(user_id)')
    .eq('event_type', RESOURCE_SAVED_EVENT)
    .eq('claims.user_id', userId)
    .order('created_at', { ascending: false })
  for (const e of ev ?? []) out.push(normalize(e.id, 'claim_event', e.payload as SavedPayload, e.claim_id, e.created_at))

  return out.sort((a, b) => (a.saved_at < b.saved_at ? 1 : -1))
}

export async function getSavedView(userId: string, store: SavedViewStore, id: string): Promise<SavedViewRecord | null> {
  if (store === 'resource') {
    const { data } = await supabase
      .from('resources')
      .select('id, payload, created_at')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('type', SAVED_VIEW_TYPE)
      .maybeSingle()
    return data ? normalize(data.id, 'resource', data.payload as SavedPayload, null, data.created_at) : null
  }
  const { data } = await supabase
    .from('claim_events')
    .select('id, claim_id, payload, created_at, claims!inner(user_id)')
    .eq('id', id)
    .eq('event_type', RESOURCE_SAVED_EVENT)
    .eq('claims.user_id', userId)
    .maybeSingle()
  return data ? normalize(data.id, 'claim_event', data.payload as SavedPayload, data.claim_id, data.created_at) : null
}

export async function deleteSavedView(userId: string, store: SavedViewStore, id: string): Promise<boolean> {
  if (store === 'resource') {
    const { error } = await supabase.from('resources').delete().eq('id', id).eq('user_id', userId).eq('type', SAVED_VIEW_TYPE)
    if (error) { console.error('[learn/saved-views] resource delete failed:', error); return false }
    return true
  }
  // Ownership guard: confirm the event's claim belongs to the user first
  // (delete can't inner-join). A resource_saved event is app-written, so
  // deleting it is not the append-only-log violation the base warns about.
  const existing = await getSavedView(userId, 'claim_event', id)
  if (!existing) return false
  const { error } = await supabase.from('claim_events').delete().eq('id', id).eq('event_type', RESOURCE_SAVED_EVENT)
  if (error) { console.error('[learn/saved-views] claim_event delete failed:', error); return false }
  return true
}
