import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { supabase } from './supabase'

const THIRTY_DAYS = 30 * 24 * 60 * 60

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
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
      if (account) {
        return { ...token, googleId: account.providerAccountId }
      }
      return token
    },

    async session({ session, token }) {
      if (session.user && token.googleId) {
        const user = session.user as typeof session.user & { id?: string }
        user.id = token.googleId as string
      }
      return session
    },
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '',
})
