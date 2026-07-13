import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 30

// Lists the user's Cruise allowlist entries (enabled + config). The UI cross-
// references this against the repo selector to show which repos are enabled.
export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('cruise_repos')
    .select('*')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ repos: data ?? [] })
}
