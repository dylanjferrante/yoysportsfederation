import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { safeParse, inSeasonNow, sportLabel, orderedSports } from '@/lib/utils'
import LeagueNav from './LeagueNav'

// Persistent league shell: header + unified inline tab bar. Section routes render below as
// `children`, so selecting a tab swaps the content in place without reloading the header.
export default async function LeagueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const { id } = await params

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const franchises = await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, id))
  const sportsEnabled = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)
  const sportNames = safeParse<Record<string, string>>(league.sportNames, {})
  const isCommissioner = league.commissionerId === session?.user?.id
  const activeNow = inSeasonNow(sportsEnabled)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Persistent header */}
      <div className="flex flex-wrap items-start gap-4 mb-5">
        {league.logoUrl
          ? <img src={league.logoUrl} alt="" className="w-16 h-16 object-contain bg-slate-100 flex-shrink-0" />
          : <div className="w-16 h-16 rounded-2xl text-white flex items-center justify-center text-3xl flex-shrink-0" style={{ background: `linear-gradient(135deg, ${league.primaryColor ?? '#0f172a'}, ${league.secondaryColor ?? '#3b82f6'})` }}>🏆</div>}
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">{league.name}</h1>
            <span className="badge bg-slate-100 text-slate-600">{league.status}</span>
          </div>
          <p className="text-slate-500 text-sm">
            {sportsEnabled.map(s => sportLabel(s, sportNames)).join(' · ')} · {league.season} · {franchises.length} franchises
          </p>
          {activeNow.length > 0 && (
            <p className="text-xs text-green-600 font-medium mt-1">● In season now: {activeNow.join(', ')}</p>
          )}
          {isCommissioner && league.inviteCode && (
            <p className="text-xs text-slate-400 mt-1">Invite code: <span className="font-mono font-bold text-slate-600 tracking-wider">{league.inviteCode}</span></p>
          )}
        </div>
      </div>

      <LeagueNav leagueId={id} isCommissioner={isCommissioner} />

      {children}
    </div>
  )
}
