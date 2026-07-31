// Google Classroom OAuth connect — initiates the Google OAuth 2.0 flow with
// Classroom-specific scopes (read-only). Stores the resulting refresh token
// (encrypted) per user in user_credentials.
//
// Required env vars (shared with NextAuth Google provider):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_URL

import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 15

const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
]

export async function POST() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const callbackBase = process.env.NEXTAUTH_URL

  if (!clientId || !clientSecret) {
    return Response.json({ error: 'Google OAuth is not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)' }, { status: 500 })
  }
  if (!callbackBase || callbackBase.includes('localhost')) {
    return Response.json({ error: 'Google Classroom OAuth requires a public NEXTAUTH_URL' }, { status: 400 })
  }

  const redirectUri = `${callbackBase.replace(/\/+$/, '')}/api/settings/classroom-callback`
  const state = encodeURIComponent(uid)

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES.join(' '))
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent') // force refresh token
  authUrl.searchParams.set('state', state)

  return Response.json({ redirect_url: authUrl.toString() })
}
