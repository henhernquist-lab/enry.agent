import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
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
      if (account?.provider === 'google') {
        const { error } = await supabase
          .from('profiles')
          .upsert(
            {
              google_id:   account.providerAccountId,
              email:       user.email!,
              name:        user.name,
              avatar_url:  user.image,
              updated_at:  new Date().toISOString(),
            },
            { onConflict: 'google_id' },
          )
        if (error) console.error('[auth] Supabase upsert error:', error)
      }
      return true
    },

    async jwt({ token, account, user }) {
      if (account?.provider === 'google') {
        return { ...token, googleId: account.providerAccountId }
      }
      if (account?.provider === 'credentials' && user?.id) {
        return { ...token, googleId: user.id }
      }
      return token
    },

    async session({ session, token }) {
      if (session.user && token.googleId) {
        const u = session.user as typeof session.user & { id?: string }
        u.id = token.googleId as string
      }
      return session
    },
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '',
})
