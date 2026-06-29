import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { teams, leagues, users } from '@/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(60).optional(),
  abbreviation: z.string().min(1).max(5).optional(),
  logo: z.string().max(2000).optional(),
  altLogo: z.string().max(2000).optional(),
  wordmark: z.string().max(2000).optional(),
  primaryColor: z.string().max(20).optional(),
  secondaryColor: z.string().max(20).optional(),
  // Commissioner-only owner edits.
  ownerName: z.string().min(1).max(80).optional(),
  ownerEmail: z.string().email().max(160).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)
  if (team.userId !== session.user.id && league?.commissionerId !== session.user.id)
    return NextResponse.json({ error: 'Not your franchise' }, { status: 403 })

  const isCommish = league?.commissionerId === session.user.id

  try {
    const { ownerName, ownerEmail, ...teamFields } = schema.parse(await req.json())

    // Owner identity can only be changed by the commissioner.
    if ((ownerName !== undefined || ownerEmail !== undefined)) {
      if (!isCommish) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
      if (ownerEmail !== undefined) {
        const [clash] = await db.select({ id: users.id }).from(users)
          .where(and(eq(users.email, ownerEmail), ne(users.id, team.userId))).limit(1)
        if (clash) return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
      }
      const userPatch: Record<string, string> = {}
      if (ownerName !== undefined) userPatch.name = ownerName
      if (ownerEmail !== undefined) userPatch.email = ownerEmail
      if (Object.keys(userPatch).length) await db.update(users).set(userPatch).where(eq(users.id, team.userId))
    }

    let updated = team
    if (Object.keys(teamFields).length) {
      ;[updated] = await db.update(teams).set(teamFields).where(eq(teams.id, id)).returning()
    }
    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
