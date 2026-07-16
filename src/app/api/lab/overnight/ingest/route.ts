import { updateOvernightRun, updateOvernightIdea, getOvernightIdeas } from '@/lib/lab/db'
import { createHash } from 'node:crypto'

export const maxDuration = 15

// POST — heartbeat ping or result ingest from the overnight runner
// Auth: Bearer token must hash-match the dispatch_token_hash stored on the run.
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return Response.json({ error: 'Missing auth token' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const runId = String(body.run_id ?? '').trim()
  const phase = String(body.phase ?? 'heartbeat').trim()

  if (!runId) return Response.json({ error: 'run_id is required' }, { status: 400 })

  // Fetch the run to verify token
  const { supabase } = await import('@/lib/supabase')
  const { data: run, error: fetchError } = await supabase
    .from('overnight_runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (fetchError || !run) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  // Verify token hash
  const tokenHash = createHash('sha256').update(token).digest('hex')
  if (tokenHash !== run.dispatch_token_hash) {
    return Response.json({ error: 'Invalid token' }, { status: 403 })
  }

  if (phase === 'heartbeat') {
    // Simple heartbeat — update the heartbeat timestamp
    await updateOvernightRun(runId, {
      status: 'running',
      heartbeat_at: new Date().toISOString(),
    })
    return Response.json({ ok: true, phase: 'heartbeat' })
  }

  if (phase === 'result') {
    // Final result from the runner
    const resultSummary = String(body.result_summary ?? '').trim()
    const resultDetail = String(body.result_detail ?? '').trim()
    const verdict = body.verdict as string | undefined // 'worth_pursuing' | 'dead_end'
    const verdictReasoning = String(body.verdict_reasoning ?? '').trim()
    const error = body.error ? String(body.error).trim() : null
    const runTimeMs = typeof body.run_time_ms === 'number' ? body.run_time_ms : null

    const newStatus = error ? 'failed' : (verdict === 'worth_pursuing' ? 'completed' : 'dead_end')

    await updateOvernightRun(runId, {
      status: newStatus,
      result_summary: resultSummary || null,
      result_detail: resultDetail || null,
      error: error || null,
      run_time_ms: runTimeMs,
      finished_at: new Date().toISOString(),
    })

    // Update the parent idea
    await updateOvernightIdea(run.idea_id, run.user_id, {
      status: newStatus === 'failed' ? 'error' : (verdict === 'worth_pursuing' ? 'completed' : 'dead_end'),
      verdict: verdict as any || null,
      verdict_reasoning: verdictReasoning || null,
      morning_note: resultSummary || null,
    })

    // Log a morning-report summary to console (can be extended to notifications later)
    console.log(`[overnight] Run ${runId} finished: ${newStatus} — ${resultSummary || error || 'no summary'}`)

    return Response.json({ ok: true, phase: 'result' })
  }

  return Response.json({ error: `Unknown phase: ${phase}` }, { status: 400 })
}
