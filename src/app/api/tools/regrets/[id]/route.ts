import { auth } from '@/lib/auth'
import { addReflection, resolveEntry } from '@/lib/regret-ledger'

export const maxDuration = 30

async function getUserId(): Promise<string | null> {
  const session = await auth()
  return (session?.user as { id?: string })?.id ?? null
}

// PUT — reflect on an entry or resolve it
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { action, outcome, reflection_text } = body as {
    action?: string; outcome?: 'held_up' | 'dissolved' | 'morphed'; reflection_text?: string
  }

  if (action === 'reflect' && outcome && reflection_text !== undefined) {
    const reflection = await addReflection(userId, id, { outcome, reflection_text })
    if (!reflection) return Response.json({ error: 'Failed to add reflection' }, { status: 500 })
    return Response.json({ reflection })
  }

  if (action === 'resolve') {
    const ok = await resolveEntry(userId, id)
    return Response.json({ success: ok })
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 })
}
