// ySF Site Redesign — Trades: propose a trade or answer offers (both in My Club), and every trade
// this season and last, each club's side with players and draft picks.
import Link from 'next/link'
import { YSF_LEAGUES } from '@/lib/ysf'
import { loadClubs, loadMoves } from '@/lib/ysf-data'
import { PageTitle } from '@/components/ysf/ui'
import { TradeCards } from '../transactions/MovesView'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { settleTrades } from '@/lib/trades'
import { reviewState, LEAGUE_OF } from '@/lib/ysf-rules'
import { playerLabel } from '@/lib/ysf-audit'
import ReviewActions from './ReviewActions'

const etStamp = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' ET' : '—'

// Trades accepted by every club and waiting out the 48-hour review (Art. IV §B)
async function UnderReview({ leagueId }: { leagueId: string }) {
  await settleTrades(leagueId)
  const session = await getServerSession(authOptions)
  const me = session ? db.all<{ id: string }>(sql`SELECT id FROM teams WHERE league_id = ${leagueId} AND user_id = ${session.user.id}`)[0]?.id : undefined
  const list = db.all<any>(sql`SELECT * FROM trades WHERE league_id = ${leagueId} AND status = 'REVIEW' ORDER BY review_deadline`)
  if (!list.length) return null
  const clubs = new Map(db.all<{ id: string; name: string; logo: string | null }>(sql`SELECT id, name, logo FROM teams WHERE league_id = ${leagueId}`).map(c => [c.id, c]))
  return (
    <section className="flex flex-col gap-3">
      <div className="ui text-[12px] font-bold tracking-[.12em]">UNDER REVIEW</div>
      {list.map(t => {
        const items = db.all<any>(sql`SELECT i.*, p.name, p.sport psport, p.position, p.eligible_positions elig, p.real_team_abbr team, d.year, d.round, d.sport dsport
          FROM trade_items i LEFT JOIN players p ON p.id = i.player_id LEFT JOIN draft_picks d ON d.id = i.pick_id WHERE i.trade_id = ${t.id}`)
        const parties = [...new Set([t.initiator_id, t.recipient_id, ...items.flatMap(i => [i.from_team_id, i.to_team_id])].filter(Boolean) as string[])]
        const st = reviewState(t, parties)
        const voted = new Set(db.all<{ k: string }>(sql`SELECT kind k FROM ysf_trade_votes WHERE trade_id = ${t.id} AND team_id = ${me ?? ''}`).map(v => v.k))
        const outsider = !!me && !parties.includes(me)
        const can = {
          complain: outsider && !st.complaintAt,
          veto: outsider && !!st.complaintAt && st.voters.includes(me!) && !voted.has('VETO') && (!st.vetoEnds || Date.now() < Date.parse(st.vetoEnds)),
          override: outsider && !st.commissionParty && st.vetoes.length >= st.needed && st.needed > 0 && !voted.has('OVERRIDE'),
        }
        const asset = (i: any) => i.player_id ? playerLabel(i.psport, i.name, i.team, i.position, i.elig)
          : i.pick_id ? `${i.year} ${LEAGUE_OF[i.dsport] ?? 'ySF'} Rookie Draft Round ${i.round} pick`
          : i.faab_amount ? `$${i.faab_amount} ${LEAGUE_OF[i.faab_sport]} FAAB` : '—'
        return (
          <article key={t.id} className="card p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{parties.map(pid => { const c = clubs.get(pid); return (
                <span key={pid} className="inline-flex items-center gap-1.5 font-semibold text-[15px]">{c?.logo && <img src={c.logo} alt="" className="w-6 h-6 object-contain" />}{c?.name}</span>) })}</div>
              <span className="ui inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none text-white" style={{ background: st.complaintAt ? '#ba0c2f' : '#000' }}>{st.complaintAt ? 'FLAGGED' : 'IN REVIEW'}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{parties.map(pid => (
              <div key={pid}>
                <div className="ui text-[11px] tracking-[.12em] text-ink-500">{clubs.get(pid)?.name?.toUpperCase()} RECEIVES</div>
                <ul className="mt-1 text-[14px] flex flex-col gap-0.5">{items.filter(i => i.to_team_id === pid).map(i => <li key={i.id}><span className="ysf-case">{asset(i)}</span></li>)}</ul>
              </div>))}
            </div>
            <div className="text-[13px] text-ink-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>Takes effect {etStamp(st.vetoEnds && st.reviewEnds && st.vetoEnds > st.reviewEnds ? st.vetoEnds : st.reviewEnds)}</span>
              {st.complaintAt && <span>Veto votes {st.vetoes.length} of {st.needed}</span>}
              {st.vetoes.length >= st.needed && st.needed > 0 && !st.commissionParty && <span>Override votes {st.overrides.length}</span>}
            </div>
            <ReviewActions tradeId={t.id} can={can} />
          </article>
        )
      })}
    </section>
  )
}

export default async function YsfTrades({ league, season: sArg }: { league: any; season?: string }) {
  const C = await loadClubs(league.id)
  const { trades } = await loadMoves(league.id, league.season)
  const seasons = [...new Set(trades.map(t => t.season))].sort().reverse()
  const season = seasons.includes(sArg ?? '') ? sArg! : (seasons[0] ?? league.season)
  const codes = Object.fromEntries(YSF_LEAGUES.map(l => [l.sport, l.code]))
  const clubs = Object.fromEntries(Object.values(C).map(c => [c.id, { name: c.name, abbreviation: c.abbreviation, logo: c.logo, color: c.color }]))
  const btn = 'inline-flex items-center justify-center h-10 px-4 rounded-lg font-display text-[13px] font-bold tracking-[.08em] leading-none border'
  return (
    <>
      <PageTitle eyebrow={`${trades.filter(t => t.season === season).length} trades · ${season.replace('-', '–')}`} title="TRADES" right={
        <div className="flex flex-wrap gap-2">
          <Link href={`/leagues/${league.id}/myteam?tab=trade`} className={`${btn} bg-black text-white border-black`}>PROPOSE A TRADE</Link>
          <Link href={`/leagues/${league.id}/myteam?tab=pending`} className={`${btn} bg-white text-black border-black`}>MY OFFERS</Link>
          <Link href={`/leagues/${league.id}/marketplace`} className={`${btn} bg-white text-black border-ink-200`}>TRADE BLOCK</Link>
        </div>} />
      {seasons.length > 1 && (
        <div className="flex gap-2">{seasons.map(x => (
          <Link key={x} href={`/leagues/${league.id}/trade${x === seasons[0] ? '' : `?s=${x}`}`} className="inline-flex items-center justify-center h-9 px-3 rounded-lg font-display text-[12px] font-bold leading-none border"
            style={{ background: x === season ? '#000' : '#fff', color: x === season ? '#fff' : '#000', borderColor: x === season ? '#000' : '#C7C7C7' }}>{x.replace('-', '–')}</Link>))}</div>
      )}
      <UnderReview leagueId={league.id} />
      <TradeCards leagueId={league.id} trades={trades.filter(t => t.season === season)} clubs={clubs} codes={codes} />
    </>
  )
}
