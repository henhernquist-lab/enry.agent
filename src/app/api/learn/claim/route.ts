import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'

// Node-click detail for the Map: one claim plus its recent claim_events, in
// reverse-chronological order. Lazy (fetched only when a node is selected) so
// the Map overview never carries every claim's full event history.
export const maxDuration = 30

const RECENT_EVENTS_LIMIT = 20

export interface ClaimEventRow {
  id: string
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

export async function GET(req: Request) {
  const session = await auth()
  const rawUserId = (session?.user as { id?: string } | undefined)?.id ?? null
  const uid = await resolveResourceUserId(rawUserId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const claimId = searchParams.get('claim_id')
  if (!claimId) return Response.json({ error: 'claim_id required' }, { status: 400 })

  // Ownership check via user_id — a claim id from another user returns 404,
  // never its events.
  const { data: claim, error: claimError } = await supabase
    .from('claims')
    .select('id, content, topic, status, strength, half_life, last_probed_at, next_probe_at, created_at')
    .eq('id', claimId)
    .eq('user_id', uid)
    .maybeSingle()

  if (claimError) {
    console.error('[learn/claim] claim query failed:', claimError)
    return Response.json({ error: 'Lookup failed' }, { status: 500 })
  }
  if (!claim) return Response.json({ error: 'Not found' }, { status: 404 })

  const { data: events, error: eventsError } = await supabase
    .from('claim_events')
    .select('id, event_type, payload, created_at')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: false })
    .limit(RECENT_EVENTS_LIMIT)

  if (eventsError) console.error('[learn/claim] events query failed:', eventsError)

  return Response.json({ claim, events: (events ?? []) as ClaimEventRow[] })
}
