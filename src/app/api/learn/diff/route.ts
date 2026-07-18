import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { computeKnowledgeDiff } from '@/lib/learn/diff'

// Knowledge Diff: POST { target } → the coverage diff of the target topic
// against the user's claim history. One LLM call (facet surface) + embedding
// comparison; bounded by maxDuration.
export const maxDuration = 60

export async function POST(req: Request) {
  const session = await auth()
  const rawUserId = (session?.user as { id?: string } | undefined)?.id ?? null
  const uid = await resolveResourceUserId(rawUserId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const target = typeof body?.target === 'string' ? body.target : ''
  if (!target.trim()) return Response.json({ error: 'target required' }, { status: 400 })

  const diff = await computeKnowledgeDiff(uid, rawUserId ?? undefined, target, typeof body?.model === 'string' ? body.model : undefined)
  return Response.json(diff)
}
