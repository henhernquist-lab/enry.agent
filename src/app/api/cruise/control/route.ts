import { supabase } from '@/lib/supabase'

export const maxDuration = 10

// POST — set a control signal (pause/cancel) on a running scan.
// The runner checks for this between major phases and responds accordingly.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const scanId = String(body.scan_id ?? '').trim()
  const signal = String(body.signal ?? '').trim()
  const instructions = body.instructions ? String(body.instructions).slice(0, 2000) : null

  if (!scanId) return Response.json({ error: 'scan_id is required' }, { status: 400 })
  if (!['pause', 'cancel', ''].includes(signal)) {
    return Response.json({ error: 'signal must be pause, cancel, or empty (clear)' }, { status: 400 })
  }

  const sig = signal === '' ? null : signal

  const { error } = await supabase
    .from('cruise_scans')
    .update({ control_signal: sig, control_instructions: instructions })
    .eq('id', scanId)

  if (error) {
    console.error('[cruise/control] update failed:', error)
    return Response.json({ error: 'Failed to update scan' }, { status: 500 })
  }

  return Response.json({ ok: true, signal: sig })
}
