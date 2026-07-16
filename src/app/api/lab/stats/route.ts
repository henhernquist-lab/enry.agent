import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getLabStats } from '@/lib/lab/db'

export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stats = await getLabStats(uid)
  return Response.json({ stats })
}
