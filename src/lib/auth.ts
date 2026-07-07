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
        const { error } = await supabase
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
        if (error) console.error('[auth] Supabase upsert error:', error)
      }
      return true
    },

    async jwt({ token, account, user }) {
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
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('google_id', providerId)
          .maybeSingle()
        return {
          ...token,
          googleId: providerId,
          sub: profile?.id ?? token.sub,
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
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        // session.user.id stays as the provider account ID (google_id) for
        // backward compat — 7+ route files use it as google_id directly.
        const u = session.user as typeof session.user & { id?: string }
        u.id = token.googleId as string

        // Expose the resolved profiles.id UUID as a separate field.
        // NB: for old sessions (pre-deploy), token.sub is the default
        // NextAuth sub claim (non-UUID), so internalUserId may not be a
        // valid UUID yet. Routes consuming it should still fall back to
        // resolveResourceUserId() until all JWTs have been refreshed.
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
