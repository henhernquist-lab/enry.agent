import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 30

// Scan history for a repo (most recent first). The UI polls this to reflect
// live scan status and to render the history list.
export async function GET(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const repo = new URL(req.url).searchParams.get('repo')
  if (!repo) return Response.json({ error: 'Missing repo' }, { status: 400 })

  const { data: repoRow } = await supabase
    .from('cruise_repos')
    .select('id')
    .eq('user_id', uid)
    .eq('full_name', repo)
    .maybeSingle()
  if (!repoRow) return Response.json({ scans: [] })

  const { data, error } = await supabase
    .from('cruise_scans')
    .select('id, trigger, status, layers, layer_status, error, dispatched_at, finished_at, summary_text')
    .eq('repo_id', repoRow.id)
    .order('dispatched_at', { ascending: false })
    .limit(25)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ scans: data ?? [] })
}
