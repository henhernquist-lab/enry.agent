import { updateOvernightRun } from '@/lib/lab/db'

export const maxDuration = 10

// POST — set a control signal (pause/cancel) on a running overnight experiment.
// The runner checks for this during heartbeat and between steps.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const runId = String(body.run_id ?? '').trim()
  const signal = String(body.signal ?? '').trim()
  const instructions = body.instructions ? String(body.instructions).slice(0, 2000) : null

  if (!runId) return Response.json({ error: 'run_id is required' }, { status: 400 })
  if (!['pause', 'cancel', ''].includes(signal)) {
    return Response.json({ error: 'signal must be pause, cancel, or empty (clear)' }, { status: 400 })
  }

  const sig = signal === '' ? null : signal

  await updateOvernightRun(runId, { control_signal: sig as 'pause' | 'cancel' | null, control_instructions: instructions })

  return Response.json({ ok: true, signal: sig })
}
