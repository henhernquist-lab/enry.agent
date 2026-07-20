import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getConnectionStatus, type ComposioToolkit } from '@/lib/composio'

export const maxDuration = 30

const TOOLKITS: ComposioToolkit[] = ['gmail', 'composio_search', 'firecrawl']

// Composio redirects the browser here after the user completes (or abandons)
// the consent screen. A normal top-level navigation to our own origin, so the
// session cookie is present. Looks up the connected_account_id this user's
// /connect call stored, re-checks its live status against Composio (never
// trusts the redirect alone), updates our row, then bounces to Settings.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const toolkit = String(url.searchParams.get('toolkit') ?? '') as ComposioToolkit
  const settingsUrl = new URL('/settings', url.origin)

  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid || !TOOLKITS.includes(toolkit)) {
    settingsUrl.searchParams.set('composio_error', 'unauthorized')
    return Response.redirect(settingsUrl.toString(), 302)
  }

  const { data: row } = await supabase
    .from('composio_connections')
    .select('composio_connected_account_id')
    .eq('user_id', uid)
    .eq('toolkit', toolkit)
    .maybeSingle()
  const connectedAccountId = row?.composio_connected_account_id as string | undefined
  if (!connectedAccountId) {
    settingsUrl.searchParams.set('composio_error', 'no_pending_connection')
    return Response.redirect(settingsUrl.toString(), 302)
  }

  try {
    const { status } = await getConnectionStatus(connectedAccountId)
    const nowIso = new Date().toISOString()
    if (status === 'ACTIVE') {
      await supabase.from('composio_connections').update({
        status: 'connected', connected_at: nowIso, error: null, updated_at: nowIso,
      }).eq('user_id', uid).eq('toolkit', toolkit)
      settingsUrl.searchParams.set('composio_connected', toolkit)
    } else {
      await supabase.from('composio_connections').update({
        status: 'error', error: `Connection ended in status ${status}`, updated_at: nowIso,
      }).eq('user_id', uid).eq('toolkit', toolkit)
      settingsUrl.searchParams.set('composio_error', `status_${status.toLowerCase()}`)
    }
  } catch (e) {
    await supabase.from('composio_connections').update({
      status: 'error', error: String((e as Error)?.message ?? e), updated_at: new Date().toISOString(),
    }).eq('user_id', uid).eq('toolkit', toolkit)
    settingsUrl.searchParams.set('composio_error', 'verify_failed')
  }

  return Response.redirect(settingsUrl.toString(), 302)
}
