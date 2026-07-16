import { getStaleOvernightRuns, updateOvernightRun, updateOvernightIdea } from '@/lib/lab/db'

export const maxDuration = 30

// Vercel cron: runs every 10 minutes to reclaim stale overnight runs.
// A run that hasn't heartbeated in 30+ minutes is marked as 'stale',
// and its parent idea is reset to 'queued' so it can be re-dispatched.
// This is the same pattern as Cruise's stale-run reclamation.
export async function GET() {
  const now = new Date().toISOString()
  const staleRuns = await getStaleOvernightRuns()

  const results: { run_id: string; idea_id: string; action: string }[] = []

  for (const run of staleRuns) {
    // Mark run as stale
    await updateOvernightRun(run.id, {
      status: 'stale',
      error: `Run marked stale — no heartbeat for 30+ minutes. Last heartbeat: ${run.heartbeat_at || 'never'}`,
      finished_at: now,
    })

    // Reset parent idea to queued so it can be re-dispatched
    await updateOvernightIdea(run.idea_id, run.user_id, {
      status: 'queued',
      latest_run_id: null,
    })

    results.push({
      run_id: run.id,
      idea_id: run.idea_id,
      action: 'marked stale, idea re-queued',
    })
  }

  console.log(`[overnight-reclaim] checked at ${now}: ${results.length} stale runs reclaimed`)
  return Response.json({ reclaimed: results.length, details: results })
}
