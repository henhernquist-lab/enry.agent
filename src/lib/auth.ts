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
      // 'workflow' is required to commit .github/workflows/* files, which the
      // Cruise enable flow does. 'repo' alone is not sufficient for that path.
      authorization: { params: { scope: 'read:user user:email repo workflow' } },
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
      const now = new Date().toISOString()

      if (account?.provider === 'google') {
        // Upsert by google_id, then select the UUID back — atomic-ish
        // create-or-refresh that also feeds the jwt callback a deterministic
        // profileId (no race with a separate select there). Upsert failure
        // blocks sign-in: a profile row is mandatory for every route.
        const userId = account.providerAccountId
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(
            { google_id: userId, email: user.email!, name: user.name, avatar_url: user.image, updated_at: now },
            { onConflict: 'google_id' },
          )
        if (upsertErr) {
          console.error('[auth] google profile upsert failed — blocking sign-in:', upsertErr)
          return '/login?error=profile_create_failed'
        }
        const { data: created } = await supabase
          .from('profiles').select('id').eq('google_id', userId).maybeSingle()
        if (created?.id) (user as Record<string, unknown>).profileId = created.id
        return true
      }

      if (account?.provider === 'github') {
        const githubId = account.providerAccountId // GitHub numeric id, e.g. "280165074"

        // (a) Already linked? Match by github_id and REUSE that profile. This
        //     is the path for a user who linked GitHub to an existing account
        //     (see migration 007) — sign-in resolves to their real profile and
        //     data instead of creating a new row. Refresh display fields only;
        //     NEVER overwrite email or google_id — the profile's canonical
        //     identity stays its Google/credentials identity, GitHub is just a
        //     linked login method. (Not touching email also avoids colliding
        //     with an existing row that shares this GitHub account's email.)
        const { data: linked } = await supabase
          .from('profiles')
          .select('id, google_id')
          .eq('github_id', githubId)
          .maybeSingle()

        if (linked) {
          await supabase
            .from('profiles')
            .update({ name: user.name, avatar_url: user.image, updated_at: now })
            .eq('id', linked.id)
          ;(user as Record<string, unknown>).profileId = linked.id
          ;(user as Record<string, unknown>).linkedGoogleId = linked.google_id
          return true
        }

        // (b) Unlinked GitHub identity → create a standalone profile. Synthetic
        //     google_id satisfies the NOT NULL/unique column; github_id stores
        //     the real id so a future sign-in matches path (a).
        const syntheticGoogleId = `github_${githubId}`
        const { error: insErr } = await supabase
          .from('profiles')
          .upsert(
            { google_id: syntheticGoogleId, github_id: githubId, email: user.email, name: user.name, avatar_url: user.image, updated_at: now },
            { onConflict: 'google_id' },
          )
        if (insErr) {
          console.error('[auth] github profile create failed — blocking sign-in:', insErr)
          return '/login?error=profile_create_failed'
        }
        const { data: created } = await supabase
          .from('profiles').select('id, google_id').eq('github_id', githubId).maybeSingle()
        if (created?.id) {
          ;(user as Record<string, unknown>).profileId = created.id
          ;(user as Record<string, unknown>).linkedGoogleId = created.google_id
        }
        return true
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
        // THE LINKING PIECE: googleId must be the LINKED profile's google_id
        // (for a linked account, its Google sub — NOT github_<id>), so every
        // downstream google_id lookup resolves to that profile and its data.
        // Both linkedGoogleId and profileId are stashed by the signIn callback
        // (match-by-github_id). Fall back to github_<id> only for the
        // never-should-happen case where signIn didn't run.
        const linkedGoogleId = (user as Record<string, unknown> | undefined)?.linkedGoogleId as string | undefined
        const profileId = (user as Record<string, unknown> | undefined)?.profileId as string | undefined
        // Persist the OAuth token durably so the session-less Cruise cron tick
        // can dispatch scheduled runs (the JWT copy below only lives in the
        // browser cookie). OAuth-App tokens don't expire; refreshed each sign-in.
        if (profileId && account.access_token) {
          await supabase.from('profiles').update({ github_token: account.access_token }).eq('id', profileId)
        }
        return {
          ...token,
          googleId: linkedGoogleId ?? `github_${account.providerAccountId}`,
          sub: profileId ?? token.sub,
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
