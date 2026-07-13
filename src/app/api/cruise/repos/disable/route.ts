import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 30

// Disables Cruise for a repo. The server refuses to dispatch scans for a
// disabled repo, so this is the hard off-switch. The committed workflow file is
// left in place (removing it is a destructive repo write we don't do silently);
// it's inert without a dispatch, which only this app performs.
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const repo = String(body.repo ?? '').trim()
  if (!repo) return Response.json({ error: 'Missing repo' }, { status: 400 })

  const { error } = await supabase
    .from('cruise_repos')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', uid)
    .eq('full_name', repo)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
