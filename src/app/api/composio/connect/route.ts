import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { createConnectionLink, type ComposioToolkit } from '@/lib/composio'

export const maxDuration = 30

const TOOLKITS: ComposioToolkit[] = ['gmail', 'googlecalendar']

// Starts a Composio Connect Link for a toolkit: creates/reuses the toolkit's
// auth config, creates a connected-account link scoped to this user, upserts a
// 'pending' row, and returns the redirect URL for the browser to follow to
// Google's real consent screen (hosted by Composio — no token ever returns here).
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const callbackBase = process.env.NEXTAUTH_URL
  if (!callbackBase || callbackBase.includes('localhost')) {
    return Response.json({ error: 'Connecting requires a public callback URL (NEXTAUTH_URL).' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const toolkit = String(body.toolkit ?? '') as ComposioToolkit
  if (!TOOLKITS.includes(toolkit)) return Response.json({ error: 'Invalid toolkit' }, { status: 400 })

  try {
    const callbackUrl = `${callbackBase.replace(/\/+$/, '')}/api/composio/callback?toolkit=${toolkit}`
    const { connectedAccountId, redirectUrl } = await createConnectionLink(toolkit, uid, callbackUrl)

    await supabase.from('composio_connections').upsert(
      {
        user_id: uid,
        toolkit,
        status: 'pending',
        composio_connected_account_id: connectedAccountId,
        error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,toolkit' },
    )

    return Response.json({ redirect_url: redirectUrl })
  } catch (e) {
    return Response.json({ error: `Could not start connection: ${String((e as Error)?.message ?? e)}` }, { status: 502 })
  }
}
