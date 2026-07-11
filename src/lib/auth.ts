import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { supabase } from './supabase'

const THIRTY_DAYS = 30 * 24 * 60 * 60

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId:     process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: 'read:user user:email repo' } },
    }),
    Credentials({
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email    = (credentials?.email    as string | undefined)?.toLowerCase().trim()
        const password = credentials?.password  as string | undefined

        if (!email || !password) return null

        const { data: profile } = await supabase
          .from('profiles')
          .select('google_id, password_hash, name')
          .eq('email', email)
          .maybeSingle()

        if (!profile?.password_hash) return null

        const valid = await bcrypt.compare(password, profile.password_hash)
        if (!valid) return null

        return { id: profile.google_id, email, name: profile.name ?? email.split('@')[0] }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: THIRTY_DAYS,
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' || account?.provider === 'github') {
        const userId = account.provider === 'github'
          ? `github_${account.providerAccountId}`
          : account.providerAccountId

        // Use a single upsert+select to atomically create-or-refresh the
        // profile row AND get the UUID back. This eliminates the race between
        // signIn (upsert) and jwt (select) that could cause the jwt callback
        // to see no profile on fresh sign-ins.
        //
        // Strategy: upsert first, then select. If the upsert fails, block
        // sign-in — a profile row is mandatory for every downstream route.
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(
            {
              google_id:  userId,
              email:      user.email!,
              name:       user.name,
              avatar_url: user.image,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'google_id' },
          )

        if (upsertErr) {
          console.error('[auth] profile upsert failed — blocking sign-in:', upsertErr)
          // Return the error page URL so the user sees what happened instead
          // of silently getting a broken session.
          return '/login?error=profile_create_failed'
        }

        // Immediately after upsert, look up the UUID and attach it to the
        // user object so the jwt callback can pick it up deterministically
        // instead of doing its own (potentially stale) select.
        const { data: created } = await supabase
          .from('profiles')
          .select('id')
          .eq('google_id', userId)
          .maybeSingle()

        if (created?.id) {
          // Stash the profiles.id UUID as a custom claim on the user. The jwt
          // callback will read this and set token.sub = profiles.id UUID so
          // session.internalUserId is always valid.
          ;(user as Record<string, unknown>).profileId = created.id
        }
      }
      return true
    },

    async jwt({ token, account, user }) {
      // Backfill googleId from token.sub ONLY when token.sub is a provider
      // account ID (not a UUID). Old GitHub JWTs stored the profiles.id UUID
      // in token.sub — copying that into googleId would break every route
      // that queries google_id (the column stores "github_12345678", not the
      // UUID). UUIDs are handled by the fallback at the bottom of this
      // callback instead.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!token.googleId && token.sub && !UUID_RE.test(token.sub)) {
        token.googleId = token.sub as string
      }

      if (account?.provider === 'google') {
        // Resolve profiles.id UUID immediately on sign-in so session.user.id
        // is always a valid UUID downstream — no per-route resolution needed.
        const providerId = account.providerAccountId
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('google_id', providerId)
          .maybeSingle()
        return {
          ...token,
          googleId: providerId,
          sub: profile?.id ?? token.sub,
        }
      }
      if (account?.provider === 'github') {
        const providerId = `github_${account.providerAccountId}`
        // Prefer the profileId stashed by the signIn callback (atomic
        // upsert+select). Fall back to a direct lookup for edge cases where
        // signIn didn't run (e.g. account linking flows).
        const resolvedSub =
          ((user as Record<string, unknown> | undefined)?.profileId as string | undefined) ??
          (await supabase
            .from('profiles')
            .select('id')
            .eq('google_id', providerId)
            .maybeSingle()
            .then((r) => r.data?.id ?? undefined))
        return {
          ...token,
          googleId: providerId,
          sub: resolvedSub ?? token.sub,
          githubToken: account.access_token,
        }
      }
      if (account?.provider === 'credentials' && user?.id) {
        // credentials authorize() returns profiles.google_id as user.id.
        // Resolve to UUID here too.
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('google_id', user.id)
          .maybeSingle()
        return {
          ...token,
          googleId: user.id,
          sub: profile?.id ?? token.sub,
        }
      }

      // ── Fallback: resolve missing googleId for old JWTs ──────────
      // JWTs created before the googleId field was added (commit 90724b1)
      // don't have token.googleId, which causes session.user.id to be
      // undefined — and every route that uses it as google_id breaks.
      // This recovery block runs once per old token, resolves googleId
      // from the profiles table, and persists it in the refreshed JWT.
      if (!token.googleId) {
        try {
          let resolvedGoogleId: string | null = null

          // Strategy 1: token.sub may already be profiles.id UUID
          // (post-fix tokens where the jwt callback resolved sub).
          if (token.sub && typeof token.sub === 'string') {
            const { data: profileBySub } = await supabase
              .from('profiles')
              .select('google_id')
              .eq('id', token.sub)
              .maybeSingle()
            if (profileBySub?.google_id) {
              resolvedGoogleId = profileBySub.google_id
            }
          }

          // Strategy 2: fall back to email (pre-fix tokens, or sub
          // didn't match a profiles.id — possible for old sessions).
          if (!resolvedGoogleId && token.email && typeof token.email === 'string') {
            const { data: profileByEmail } = await supabase
              .from('profiles')
              .select('google_id')
              .eq('email', token.email)
              .maybeSingle()
            if (profileByEmail?.google_id) {
              resolvedGoogleId = profileByEmail.google_id
            }
          }

          if (resolvedGoogleId) {
            console.log('[auth] Resolved missing googleId:', resolvedGoogleId, 'for', token.email ?? token.sub)
            return { ...token, googleId: resolvedGoogleId }
          }

          console.warn('[auth] Could not resolve googleId — fallbacks exhausted for sub:', token.sub, 'email:', token.email)
        } catch (err) {
          console.error('[auth] Error resolving missing googleId:', err)
        }
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        // session.user.id stays as the provider account ID (google_id) for
        // backward compat — 7+ route files use it as google_id directly.
        const u = session.user as typeof session.user & { id?: string }
        u.id = (token.googleId ?? token.sub) as string

        // Expose the resolved profiles.id UUID as a separate field.
        const s = session as typeof session & { internalUserId?: string }
        s.internalUserId = (token.sub ?? token.googleId) as string
      }
      if (token.githubToken) {
        const s = session as typeof session & { githubToken?: string }
        s.githubToken = token.githubToken as string
      }
      return session
    },
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '',
})
