import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { disconnectConnection, type ComposioToolkit } from '@/lib/composio'

export const maxDuration = 30

const TOOLKITS: ComposioToolkit[] = ['gmail', 'composio_search', 'firecrawl']

// Revokes the connected account on Composio's side (which revokes the
// underlying Gmail/Calendar OAuth token) and marks the row disconnected. A
// Composio-side 404 (already gone) is treated as success, not an error.
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const toolkit = String(body.toolkit ?? '') as ComposioToolkit
  if (!TOOLKITS.includes(toolkit)) return Response.json({ error: 'Invalid toolkit' }, { status: 400 })

  const { data: row } = await supabase
    .from('composio_connections')
    .select('composio_connected_account_id')
    .eq('user_id', uid)
    .eq('toolkit', toolkit)
    .maybeSingle()
  const connectedAccountId = row?.composio_connected_account_id as string | undefined

  if (connectedAccountId) {
    try {
      await disconnectConnection(connectedAccountId)
    } catch (e) {
      // Composio 404s for an already-revoked account — don't block the local
      // disconnect on that; only report genuinely unexpected failures.
      const msg = String((e as Error)?.message ?? e)
      if (!/not found|404/i.test(msg)) {
        return Response.json({ error: `Could not disconnect: ${msg}` }, { status: 502 })
      }
    }
  }

  await supabase.from('composio_connections').update({
    status: 'disconnected', composio_connected_account_id: null, connected_at: null, error: null,
    updated_at: new Date().toISOString(),
  }).eq('user_id', uid).eq('toolkit', toolkit)

  return Response.json({ ok: true })
}
