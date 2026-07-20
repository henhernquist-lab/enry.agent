import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { createConnectionLink, type ComposioToolkit, resolveAuthConfigId, verifyAuthConfig } from '@/lib/composio'

export const maxDuration = 30

const TOOLKITS: ComposioToolkit[] = ['gmail']

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
    const authConfigId = await resolveAuthConfigId(toolkit)
    // Pre-flight: confirm the auth config exists and is reachable with this API
    // key before asking Composio to create a connected-account link. This turns
    // the SDK's generic "Failed to create connected account link" into a clear
    // "auth config not found / not accessible" message when the ID is wrong.
    await verifyAuthConfig(authConfigId)
    const { connectedAccountId, redirectUrl } = await createConnectionLink(toolkit, uid, callbackUrl)

    await supabase.from('composio_connections').upsert(
      {
        user_id: uid,
        toolkit,
        status: 'pending',
        composio_auth_config_id: authConfigId,
        composio_connected_account_id: connectedAccountId,
        error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,toolkit' },
    )

    return Response.json({ redirect_url: redirectUrl })
  } catch (e) {
    // Capture the full Composio error chain so we can diagnose SDK/API issues.
    const err = e as Error & { cause?: unknown; statusCode?: number; code?: string; response?: unknown }
    const cause = err.cause as Error & { status?: number; statusCode?: number; response?: unknown; body?: unknown; message?: string } | undefined
    const diagnostic = {
      message: err.message,
      name: err.name,
      code: err.code,
      statusCode: err.statusCode ?? cause?.status ?? cause?.statusCode,
      causeMessage: cause?.message,
      causeBody: cause?.body,
      causeResponse: cause?.response,
      authConfigIdTried: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID ?? undefined,
      userId: uid,
      toolkit,
    }
    // eslint-disable-next-line no-console
    console.error('[composio/connect] failed to create link', diagnostic)
    return Response.json(
      {
        error: `Could not start connection: ${String(err.message ?? e)}`,
        diagnostic,
      },
      { status: 502 },
    )
  }
}
