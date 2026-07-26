import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getRunStatus } from '@/lib/benchmark/storage'

export const maxDuration = 10
export const dynamic = 'force-dynamic'

// Poll a single benchmark run's live progress + status — same shape family as
// /api/cruise/live-steps. The client polls this while a run is 'running' and
// stops once status is 'completed' or 'failed'.
export async function GET(req: NextRequest) {
  const session = await auth()
  const googleId = (session?.user as { id?: string } | undefined)?.id ?? null
  const uid = await resolveResourceUserId(googleId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const runId = new URL(req.url).searchParams.get('runId')
  if (!runId) return Response.json({ error: 'runId is required' }, { status: 400 })

  const status = await getRunStatus(uid, runId)
  if (!status) return Response.json({ error: 'Run not found' }, { status: 404 })

  return Response.json(status)
}
