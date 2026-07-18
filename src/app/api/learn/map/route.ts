import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getMapData } from '@/lib/learn/map'

// Read-only overview for Learn's Map tab: every non-retired claim as a node
// (with live-computed strength + fog freshness) plus a nearest-neighbor link
// set for the client's force layout. Node click detail (recent claim_events)
// is a separate lazy call — see ./claim/route.ts.
export const maxDuration = 30

export async function GET() {
  const session = await auth()
  const rawUserId = (session?.user as { id?: string } | undefined)?.id ?? null
  const uid = await resolveResourceUserId(rawUserId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getMapData(uid)
  return Response.json(data)
}
