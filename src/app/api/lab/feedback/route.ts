import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { setExplicitFeedback } from '@/lib/lab/db'

export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const invocationId = typeof body.invocation_id === 'string' ? body.invocation_id : null
  const feedback = body.feedback

  if (!invocationId || !['helpful', 'missed', 'corrected'].includes(feedback)) {
    return Response.json({ error: 'Invalid invocation_id or feedback' }, { status: 400 })
  }

  await setExplicitFeedback(invocationId, feedback)

  return Response.json({ ok: true })
}
