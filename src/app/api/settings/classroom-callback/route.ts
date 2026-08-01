// Google Classroom OAuth callback — Google redirects here after consent.
// Exchanges the auth code for tokens, encrypts the refresh token, stores
// it in user_credentials, then redirects to Settings.

import { supabase } from '@/lib/supabase'
import { encrypt } from '@/lib/crypto'

export const maxDuration = 30

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // the uid we passed
  const error = url.searchParams.get('error')
  const settingsUrl = new URL('/settings', url.origin)

  if (!state) {
    settingsUrl.searchParams.set('classroom_error', 'no_state')
    return Response.redirect(settingsUrl.toString(), 302)
  }

  if (error || !code) {
    settingsUrl.searchParams.set('classroom_error', error ?? 'no_code')
    return Response.redirect(settingsUrl.toString(), 302)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const callbackBase = process.env.NEXTAUTH_URL

  if (!clientId || !clientSecret) {
    settingsUrl.searchParams.set('classroom_error', 'not_configured')
    return Response.redirect(settingsUrl.toString(), 302)
  }

  const redirectUri = `${(callbackBase ?? url.origin).replace(/\/+$/, '')}/api/settings/classroom-callback`

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error('[classroom-callback] token exchange failed:', tokenData)
      settingsUrl.searchParams.set('classroom_error', 'token_exchange_failed')
      return Response.redirect(settingsUrl.toString(), 302)
    }

    // Try to get the user's email for the label
    let label = 'Google Classroom'
    if (tokenData.access_token) {
      try {
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        const profile = await profileRes.json()
        if (profile.email) label = profile.email
      } catch { /* label fallback is fine */ }
    }

    // Encrypt and store the refresh token
    const encryptedToken = encrypt(tokenData.refresh_token)

    await supabase.from('user_credentials').upsert(
      {
        user_id: state,
        service: 'google_classroom',
        credential_a: encryptedToken,
        label,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,service' },
    )

    settingsUrl.searchParams.set('classroom_connected', 'true')
  } catch (e) {
    console.error('[classroom-callback] failed:', e)
    settingsUrl.searchParams.set('classroom_error', 'callback_failed')
  }

  return Response.redirect(settingsUrl.toString(), 302)
}
