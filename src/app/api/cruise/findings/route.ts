import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { SEVERITY_RANK, type CruiseFinding } from '@/lib/cruise/types'

export const maxDuration = 30

// Findings for a scan, ranked most-severe first (then by confidence). Ownership
// is enforced by joining the scan back to the user's allowlisted repo.
export async function GET(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const scanId = new URL(req.url).searchParams.get('scan')
  if (!scanId) return Response.json({ error: 'Missing scan' }, { status: 400 })

  // Verify the scan belongs to this user before returning its findings.
  const { data: scan } = await supabase
    .from('cruise_scans')
    .select('id, user_id')
    .eq('id', scanId)
    .maybeSingle()
  if (!scan || scan.user_id !== uid) return Response.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('cruise_findings')
    .select('*')
    .eq('scan_id', scanId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const findings = (data ?? []) as CruiseFinding[]
  findings.sort((a, b) =>
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence,
  )

  return Response.json({ findings })
}
