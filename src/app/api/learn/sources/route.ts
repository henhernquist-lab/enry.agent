import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getSources, pinSource, unpinSource, setImportRead } from '@/lib/learn/sources'

// Sources tab data + pin/unpin. GET lists sources grouped for browsing; POST
// toggles a pin. Pinning is the trust mechanism only — no enforcement here
// (that's Source-Grounded Mode later).
export const maxDuration = 30

async function uidFrom(): Promise<string | null> {
  const session = await auth()
  const rawUserId = (session?.user as { id?: string } | undefined)?.id ?? null
  return resolveResourceUserId(rawUserId)
}

export async function GET() {
  const uid = await uidFrom()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return Response.json(await getSources(uid))
}

export async function POST(req: Request) {
  const uid = await uidFrom()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const action = body?.action

  // Reading-list read/unread toggle on a folded import.
  if (action === 'mark_read' || action === 'mark_unread') {
    const resourceId = typeof body?.resource_id === 'string' ? body.resource_id : null
    if (!resourceId) return Response.json({ error: 'resource_id required' }, { status: 400 })
    const unread = await setImportRead(uid, resourceId, action === 'mark_read')
    if (unread === null) return Response.json({ error: 'import not found' }, { status: 404 })
    return Response.json({ ok: true, unread })
  }

  const sourceType = typeof body?.source_type === 'string' ? body.source_type : null
  const sourceRef = body?.source_ref === null || typeof body?.source_ref === 'string' ? (body.source_ref ?? null) : null
  if (!sourceType || (action !== 'pin' && action !== 'unpin')) {
    return Response.json({ error: 'action (pin|unpin|mark_read|mark_unread) and source_type required' }, { status: 400 })
  }

  const ok = action === 'pin' ? await pinSource(uid, sourceType, sourceRef) : await unpinSource(uid, sourceType, sourceRef)
  if (!ok) return Response.json({ error: `${action} failed` }, { status: 500 })
  return Response.json({ ok: true, pinned: action === 'pin' })
}
