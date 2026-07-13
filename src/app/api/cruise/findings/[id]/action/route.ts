import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 30

// Per-finding actions. Phase 1 supports dismiss / not_a_bug (both suppress the
// finding on future scans via the dismissals table) and reopen (undo). The
// 'fix' action lands in Phase 3.
type Action = 'dismiss' | 'not_a_bug' | 'reopen'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body.action as Action
  if (!['dismiss', 'not_a_bug', 'reopen'].includes(action)) {
    return Response.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Load the finding + its scan for ownership and the repo_id needed to record
  // a repo-scoped dismissal.
  const { data: finding } = await supabase
    .from('cruise_findings')
    .select('id, fingerprint, scan:cruise_scans!inner(user_id, repo_id)')
    .eq('id', id)
    .maybeSingle()
  const scan = (finding?.scan ?? null) as { user_id: string; repo_id: string } | null
  if (!finding || !scan || scan.user_id !== uid) return Response.json({ error: 'Not found' }, { status: 404 })

  if (action === 'reopen') {
    await supabase.from('cruise_findings').update({ status: 'open' }).eq('id', id)
    await supabase.from('cruise_dismissals').delete().eq('repo_id', scan.repo_id).eq('fingerprint', finding.fingerprint)
    return Response.json({ ok: true, status: 'open' })
  }

  const status = action === 'dismiss' ? 'dismissed' : 'not_a_bug'
  await supabase.from('cruise_findings').update({ status }).eq('id', id)
  await supabase
    .from('cruise_dismissals')
    .upsert({ repo_id: scan.repo_id, fingerprint: finding.fingerprint, reason: status }, { onConflict: 'repo_id,fingerprint' })

  return Response.json({ ok: true, status })
}
