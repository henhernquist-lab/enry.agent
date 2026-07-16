import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import type { CruiseGoalRun, CruiseGoalStep } from '@/lib/cruise/types'

export const maxDuration = 30

// Session-authed fetch of one goal run + its live step checklist, for the
// polling UI. Distinct from /context (token-authed, for the runner to resume
// from) — this is what the browser reads.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: run } = await supabase.from('cruise_goal_runs').select('*').eq('id', id).maybeSingle()
  if (!run || run.user_id !== uid) return Response.json({ error: 'Not found' }, { status: 404 })

  const { data: steps } = await supabase
    .from('cruise_goal_steps')
    .select('*')
    .eq('goal_run_id', id)
    .order('seq', { ascending: true })

  return Response.json({ run: run as CruiseGoalRun, steps: (steps ?? []) as CruiseGoalStep[] })
}
