import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { supabase } from './supabase'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const { error } = await supabase
          .from('profiles')
          .upsert({
            google_id: account.providerAccountId,
            email: user.email!,
            name: user.name,
            avatar_url: user.image,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'google_id' })
        if (error) console.error('Supabase upsert error:', error)
      }
      return true
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        const user = session.user as typeof session.user & { id?: string }
        user.id = token.sub
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
})
