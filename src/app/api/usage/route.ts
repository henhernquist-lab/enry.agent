import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getUsageData } from '@/lib/usage/log'
import type { UsageRange } from '@/lib/usage/types'

export async function GET(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const rangeParam = url.searchParams.get('range') ?? 'week'
  const valid: UsageRange[] = ['today', 'week', 'month']
  const range: UsageRange = valid.includes(rangeParam as UsageRange) ? rangeParam as UsageRange : 'week'

  const data = await getUsageData(uid, range)
  return Response.json(data)
}
