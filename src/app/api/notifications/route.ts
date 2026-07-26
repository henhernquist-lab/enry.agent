import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getNotifications } from '@/lib/notifications'

export const maxDuration = 30

export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await getNotifications(uid)
  return Response.json({ items })
}
