import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 30

// Lists this user's Composio connector statuses, for the Settings > Connectors
// cards. Read-only DB lookup — no Composio API call (avoids spending any of
// the tool-call-metered surface just to render a status badge).
export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('composio_connections')
    .select('toolkit, status, error, connected_at')
    .eq('user_id', uid)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ connections: data ?? [] })
}
