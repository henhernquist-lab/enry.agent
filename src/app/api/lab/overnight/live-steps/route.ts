import { supabase } from '@/lib/supabase'

export const maxDuration = 10

// GET — poll for the latest live_steps of a running overnight experiment.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const runId = url.searchParams.get('run_id')
  if (!runId) return Response.json({ error: 'run_id is required' }, { status: 400 })

  const { data } = await supabase
    .from('overnight_runs')
    .select('id, status, live_steps, heartbeat_at, finished_at')
    .eq('id', runId)
    .maybeSingle()

  if (!data) return Response.json({ error: 'Run not found' }, { status: 404 })

  const steps = Array.isArray((data as Record<string, unknown>).live_steps)
    ? (data as Record<string, unknown>).live_steps
    : []

  return Response.json({
    run_id: data.id,
    status: data.status,
    steps,
    heartbeat_at: data.heartbeat_at,
    finished_at: data.finished_at,
  })
}
