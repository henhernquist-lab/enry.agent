import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getSources, pinSource, unpinSource } from '@/lib/learn/sources'

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
  const sourceType = typeof body?.source_type === 'string' ? body.source_type : null
  const sourceRef = body?.source_ref === null || typeof body?.source_ref === 'string' ? (body.source_ref ?? null) : null
  if (!sourceType || (action !== 'pin' && action !== 'unpin')) {
    return Response.json({ error: 'action (pin|unpin) and source_type required' }, { status: 400 })
  }

  const ok = action === 'pin' ? await pinSource(uid, sourceType, sourceRef) : await unpinSource(uid, sourceType, sourceRef)
  if (!ok) return Response.json({ error: `${action} failed` }, { status: 500 })
  return Response.json({ ok: true, pinned: action === 'pin' })
}
