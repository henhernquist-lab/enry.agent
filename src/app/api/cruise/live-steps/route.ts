import { supabase } from '@/lib/supabase'

export const maxDuration = 10

// GET — poll for the latest live_steps of a running scan.
// Returns the steps array + the scan status so the UI knows when the run is done.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const scanId = url.searchParams.get('scan_id')
  if (!scanId) return Response.json({ error: 'scan_id is required' }, { status: 400 })

  const { data } = await supabase
    .from('cruise_scans')
    .select('id, status, live_steps, heartbeat_at, finished_at')
    .eq('id', scanId)
    .maybeSingle()

  if (!data) return Response.json({ error: 'Scan not found' }, { status: 404 })

  const steps = Array.isArray((data as Record<string, unknown>).live_steps)
    ? (data as Record<string, unknown>).live_steps
    : []

  return Response.json({
    scan_id: data.id,
    status: data.status,
    steps,
    heartbeat_at: data.heartbeat_at,
    finished_at: data.finished_at,
  })
}
