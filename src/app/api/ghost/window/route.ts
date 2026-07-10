import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { assembleCorpus } from '@/lib/ghost/corpus'

export const maxDuration = 30

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

// POST { start, end } → what data exists in that window, so Henry knows how
// rich the reconstruction will be before he starts talking to it.
export async function POST(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const start = String(body.start ?? '')
  const end = String(body.end ?? '')

  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
    return Response.json({ error: 'Invalid window. Expected start/end as YYYY-MM-DD with start <= end.' }, { status: 400 })
  }
  const today = new Date().toISOString().slice(0, 10)
  if (start > today) {
    return Response.json({ error: 'Window is entirely in the future — Ghost Mode reconstructs the past.' }, { status: 400 })
  }

  const corpus = await assembleCorpus(uid, start, end > today ? today : end)

  return Response.json({
    countsByType: corpus.countsByType,
    totalResources: corpus.corpusResourceIds.length,
    voiceSampleCount: corpus.voiceSamples.length,
    richness: corpus.richness,
    corpusResourceIds: corpus.corpusResourceIds,
  })
}
