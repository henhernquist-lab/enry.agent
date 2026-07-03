import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { supabase } from './supabase'

const THIRTY_DAYS = 30 * 24 * 60 * 60

async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string
  expiresAt: number
  refreshToken: string
} | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    const tokens = await res.json()
    if (!res.ok) {
      console.error('[auth] Token refresh error response:', tokens)
      return null
    }
    return {
      accessToken: tokens.access_token as string,
      // expires_in is seconds from now
      expiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in as number),
      // Google only returns a new refresh_token occasionally; keep the old one if absent
      refreshToken: (tokens.refresh_token as string) ?? refreshToken,
    }
  } catch (err) {
    console.error('[auth] Token refresh fetch failed:', err)
    return null
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events',
          // offline access is required to receive a refresh_token
          access_type: 'offline',
          // always show consent so Google always returns the refresh_token
          prompt: 'consent',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: THIRTY_DAYS,
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        console.log('[auth] signIn upsert for google_id:', account.providerAccountId)
        const { error } = await supabase
          .from('profiles')
          .upsert(
            {
              google_id: account.providerAccountId,
              email: user.email!,
              name: user.name,
              avatar_url: user.image,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'google_id' },
          )
        if (error) console.error('[auth] Supabase upsert error:', error)
      }
      return true
    },

    async jwt({ token, account }) {
      const t = token as Record<string, unknown>

      // Initial sign-in: capture tokens from the Google OAuth response
      if (account) {
        t.googleId = account.providerAccountId
        t.accessToken = account.access_token
        t.refreshToken = account.refresh_token
        // account.expires_at is seconds since epoch
        t.expiresAt = account.expires_at
        return token
      }

      // Subsequent calls: if access token is still valid (60s buffer), return as-is
      const expiresAt = t.expiresAt as number | undefined
      if (expiresAt && Date.now() / 1000 < expiresAt - 60) {
        return token
      }

      // Token expired — attempt refresh
      const refreshToken = t.refreshToken as string | undefined
      if (!refreshToken) {
        // User authenticated before calendar scopes were added; needs re-auth
        t.calendarError = 'no_refresh_token'
        return token
      }

      console.log('[auth] Access token expired, refreshing…')
      const refreshed = await refreshGoogleToken(refreshToken)
      if (refreshed) {
        t.accessToken = refreshed.accessToken
        t.expiresAt = refreshed.expiresAt
        t.refreshToken = refreshed.refreshToken
        delete t.calendarError
      } else {
        t.calendarError = 'refresh_failed'
      }

      return token
    },

    async session({ session, token }) {
      const t = token as Record<string, unknown>

      // Map googleId onto session.user.id (existing behaviour)
      if (session.user && t.googleId) {
        const user = session.user as typeof session.user & { id?: string }
        user.id = t.googleId as string
      }

      // Expose access token and any calendar error to server-side route handlers
      const s = session as typeof session & {
        accessToken?: string
        calendarError?: string
      }
      s.accessToken = t.accessToken as string | undefined
      if (t.calendarError) s.calendarError = t.calendarError as string

      return session
    },
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '',
})
