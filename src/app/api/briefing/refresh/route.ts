import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { generateBriefingForUser, findBriefingForDate } from '@/lib/chief-of-staff'
import { todayISO } from '@/lib/aperture'
import type { BriefingPayload } from '@/lib/resources'

export const maxDuration = 60

const MAX_REFRESHES_PER_DAY = 3

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function POST() {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: max 3 manual refreshes per day, tracked in the row's payload.
  const existing = await findBriefingForDate(uid, todayISO())
  const usedRefreshes = existing ? (existing.payload as BriefingPayload).refresh_count ?? 0 : 0
  if (usedRefreshes >= MAX_REFRESHES_PER_DAY) {
    return Response.json(
      { error: `Refresh limit reached (${MAX_REFRESHES_PER_DAY}/day). Try again tomorrow.` },
      { status: 429 },
    )
  }

  const result = await generateBriefingForUser(uid, 'refresh')
  if (result.status === 'failed') {
    return Response.json({ error: 'Briefing generation failed' }, { status: 500 })
  }

  const refreshed = await findBriefingForDate(uid, todayISO())
  return Response.json({ ok: true, briefing: refreshed?.payload ?? null, id: result.id })
}
