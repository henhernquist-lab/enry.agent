import { auth } from '@/lib/auth'
import { getContradictions, scanForContradictions, updateContradictionStatus } from '@/lib/contradictions'

export const maxDuration = 60

async function getUserId(): Promise<string | null> {
  const session = await auth()
  return (session?.user as { id?: string })?.id ?? null
}

// GET — list contradictions for current user
export async function GET() {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const contradictions = await getContradictions(userId)
  return Response.json({ contradictions })
}

// POST — trigger a scan (action=scan) or update status (action=dismiss|reflect)
export async function POST(req: Request) {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { action, id } = body as { action?: string; id?: string }

  if (action === 'scan') {
    const result = await scanForContradictions(userId)
    return Response.json(result)
  }

  if ((action === 'dismiss' || action === 'reflected') && id) {
    const status = action === 'dismiss' ? 'dismissed' : 'reflected'
    const ok = await updateContradictionStatus(userId, id, status)
    return Response.json({ success: ok })
  }

  return Response.json({ error: 'Invalid action. Use action=scan, action=dismiss, or action=reflected.' }, { status: 400 })
}
