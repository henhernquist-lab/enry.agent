import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getUsageAlerts, dismissAlert } from '@/lib/usage/quota'

export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const alerts = await getUsageAlerts(uid)
  return Response.json({ alerts })
}

export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const alertKey = typeof body.alertKey === 'string' ? body.alertKey : ''
  if (!alertKey) return Response.json({ error: 'alertKey required' }, { status: 400 })

  const ok = await dismissAlert(uid, alertKey)
  return Response.json({ ok })
}
