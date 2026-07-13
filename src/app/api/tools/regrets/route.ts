import { auth } from '@/lib/auth'
import { listEntries, createEntry, addReflection, resolveEntry, getPendingResurfaceCount, getPatterns } from '@/lib/regret-ledger'

export const maxDuration = 30

async function getUserId(): Promise<string | null> {
  const session = await auth()
  return (session?.user as { id?: string })?.id ?? null
}

// GET — list entries, or check pending resurface count, or get patterns
export async function GET(req: Request) {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode')

  if (mode === 'pending') {
    const count = await getPendingResurfaceCount(userId)
    return Response.json({ pending: count })
  }

  if (mode === 'patterns') {
    const result = await getPatterns(userId)
    return Response.json(result)
  }

  const entries = await listEntries(userId)
  return Response.json({ entries })
}

// POST — create a new regret entry
export async function POST(req: Request) {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { decision_text, why_uncertain, alternative_considered, worry, resurface_interval_days } = body as {
    decision_text?: string; why_uncertain?: string; alternative_considered?: string
    worry?: string; resurface_interval_days?: number
  }

  if (!decision_text || !why_uncertain) {
    return Response.json({ error: 'decision_text and why_uncertain are required' }, { status: 400 })
  }

  const entry = await createEntry(userId, { decision_text, why_uncertain, alternative_considered, worry, resurface_interval_days })
  if (!entry) return Response.json({ error: 'Failed to create entry' }, { status: 500 })
  return Response.json({ entry })
}
