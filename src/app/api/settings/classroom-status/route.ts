// Check if the current user has Google Classroom connected.
import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { hasClassroomConnection } from '@/lib/classroom'

export const maxDuration = 10

export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const connected = await hasClassroomConnection(uid)
  return Response.json({ connected })
}
