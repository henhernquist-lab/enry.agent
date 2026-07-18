import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getAmbientSettings, saveAmbientSettings, type AmbientSettings } from '@/lib/learn/ambient'

// Ambient settings — lives in Learn's own settings, not the global app settings.
export const maxDuration = 30

async function uidFrom(): Promise<string | null> {
  const session = await auth()
  const rawUserId = (session?.user as { id?: string } | undefined)?.id ?? null
  return resolveResourceUserId(rawUserId)
}

export async function GET() {
  const uid = await uidFrom()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return Response.json(await getAmbientSettings(uid))
}

export async function POST(req: Request) {
  const uid = await uidFrom()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const patch: Partial<AmbientSettings> = {}
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (Number.isFinite(body.max_per_day)) patch.max_per_day = Math.max(1, Math.min(10, Math.floor(body.max_per_day)))
  if (Number.isFinite(body.quiet_start_hour)) patch.quiet_start_hour = Math.max(0, Math.min(23, Math.floor(body.quiet_start_hour)))
  if (Number.isFinite(body.quiet_end_hour)) patch.quiet_end_hour = Math.max(0, Math.min(23, Math.floor(body.quiet_end_hour)))
  if (typeof body.timezone === 'string' && body.timezone) patch.timezone = body.timezone
  return Response.json(await saveAmbientSettings(uid, patch))
}
