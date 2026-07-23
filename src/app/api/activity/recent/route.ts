import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getRecentActivity } from '@/lib/usage/activity'

export const maxDuration = 10
export const dynamic = 'force-dynamic'

// Shared "what is Enry doing right now" endpoint — the homepage Live
// Activity widget, the Room's worker HUD/speech bubble, and the Room's
// ambient idle state all read this so the three surfaces can't disagree.
export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string } | undefined)?.id ?? null
  const uid = await resolveResourceUserId(googleId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const activity = await getRecentActivity(uid)
  return Response.json(activity)
}
