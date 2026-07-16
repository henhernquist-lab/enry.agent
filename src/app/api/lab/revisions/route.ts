import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getPromptRevisions } from '@/lib/lab/db'

export async function GET(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const validStatus = status === 'proposed' || status === 'approved' || status === 'rejected' ? status : undefined

  const revisions = await getPromptRevisions(uid, { status: validStatus })
  return Response.json({ revisions })
}
