import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import AppleProvider from 'next-auth/providers/apple'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { claimInvite, openInvite } from '@/lib/invites'

// Google and Apple sign-in switch on when their keys are set (GOOGLE_CLIENT_ID/SECRET, APPLE_ID/APPLE_SECRET).
// A Google/Apple account signs in only if its email belongs to a member, or while claiming a club through
// an invite link (the invite page sets the ysf_invite cookie first).
const oauth = [
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })] : []),
  ...(process.env.APPLE_ID && process.env.APPLE_SECRET ? [AppleProvider({ clientId: process.env.APPLE_ID, clientSecret: process.env.APPLE_SECRET })] : []),
]
const userByEmail = (email: string) => db.all<{ id: string; name: string }>(sql`SELECT id, name FROM users WHERE lower(email) = ${email.trim().toLowerCase()}`)[0]
async function inviteToken() { try { return (await cookies()).get('ysf_invite')?.value ?? null } catch { return null } }

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        // emails match regardless of case
        const found = userByEmail(credentials.email)
        const [u] = found ? await db.select().from(users).where(eq(users.id, found.id)).limit(1) : []
        if (!u) return null
        const valid = await bcrypt.compare(credentials.password, u.password)
        if (!valid) return null
        return { id: u.id, name: u.name, email: u.email }
      },
    }),
    ...oauth,
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider === 'credentials') return true
      const email = user.email ?? ''
      if (!email) return false
      if (userByEmail(email)) return true
      return !!openInvite(await inviteToken())   // a new owner arriving through their club's invite
    },
    async jwt({ token, user, account }) {
      if (user && account && account.provider !== 'credentials') {
        // map the Google/Apple account to the member with that email, claiming the club on first sign-in
        const email = (user.email ?? '').toLowerCase()
        let u = userByEmail(email)
        const inv = await inviteToken()
        if (openInvite(inv)) { const id = await claimInvite(inv!, { email, name: user.name }); if (id) u = { id, name: user.name ?? '' } }
        if (u) { token.id = u.id; token.name = u.name || token.name }
        return token
      }
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token && session.user) session.user.id = token.id as string
      return session
    },
  },
}
export const oauthProviders = oauth.map(p => p.id)
