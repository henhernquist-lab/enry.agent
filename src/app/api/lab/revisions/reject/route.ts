import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { rejectPromptRevision } from '@/lib/lab/db'

export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const revisionId = typeof body.revision_id === 'string' ? body.revision_id : null
  if (!revisionId) {
    return Response.json({ error: 'revision_id is required' }, { status: 400 })
  }

  await rejectPromptRevision(uid, revisionId)
  return Response.json({ ok: true })
}
