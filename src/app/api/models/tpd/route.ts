import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getTpdStatuses } from '@/lib/usage/tpd-status'

export const maxDuration = 10

// Per-model daily token budget for the Groq models. Groq publishes no TPD
// header, so this is the only way the picker can warn before a model goes
// dark for the rest of the day.
export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    return Response.json({ tpd: await getTpdStatuses(uid) })
  } catch (e) {
    // Never let a budget indicator break the picker.
    console.error('[api/models/tpd] failed:', e)
    return Response.json({ tpd: [] })
  }
}
