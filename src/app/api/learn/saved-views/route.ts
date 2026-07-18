import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { saveView, listSavedViews, getSavedView, deleteSavedView, type LearnViewKind, type SavedViewStore } from '@/lib/learn/saved-views'

// Saveable Map/Diff/Sources views. GET lists (or ?id=&store= fetches one for
// exact reopen), POST saves, DELETE removes.
export const maxDuration = 30

const VIEW_KINDS = ['map', 'diff', 'sources']

async function uidFrom(): Promise<string | null> {
  const session = await auth()
  const rawUserId = (session?.user as { id?: string } | undefined)?.id ?? null
  return resolveResourceUserId(rawUserId)
}

export async function GET(req: Request) {
  const uid = await uidFrom()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const store = searchParams.get('store')
  if (id) {
    if (store !== 'resource' && store !== 'claim_event') return Response.json({ error: 'valid store required with id' }, { status: 400 })
    const rec = await getSavedView(uid, store, id)
    if (!rec) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(rec)
  }
  return Response.json({ saved: await listSavedViews(uid) })
}

export async function POST(req: Request) {
  const uid = await uidFrom()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const view = body?.view as LearnViewKind
  if (!VIEW_KINDS.includes(view) || typeof body?.title !== 'string') {
    return Response.json({ error: 'view (map|diff|sources) and title required' }, { status: 400 })
  }
  const saved = await saveView(uid, {
    view,
    title: body.title,
    params: body.params ?? {},
    snapshot: body.snapshot ?? {},
    claimId: typeof body.claim_id === 'string' ? body.claim_id : null,
  })
  if (!saved) return Response.json({ error: 'Save failed' }, { status: 500 })
  return Response.json({ ok: true, ...saved })
}

export async function DELETE(req: Request) {
  const uid = await uidFrom()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const store = searchParams.get('store') as SavedViewStore | null
  if (!id || (store !== 'resource' && store !== 'claim_event')) {
    return Response.json({ error: 'id and valid store required' }, { status: 400 })
  }
  const ok = await deleteSavedView(uid, store, id)
  if (!ok) return Response.json({ error: 'Delete failed' }, { status: 500 })
  return Response.json({ ok: true })
}
