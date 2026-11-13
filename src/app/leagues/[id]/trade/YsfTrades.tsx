// ySF Site Redesign — Trades: propose a trade or answer offers (both in My Club), and every trade
// this season and last, each club's side with players and draft picks.
import Link from 'next/link'
import { YSF_LEAGUES } from '@/lib/ysf'
import { loadClubs, loadMoves } from '@/lib/ysf-data'
import { PageTitle } from '@/components/ysf/ui'
import { TradeCards } from '../transactions/MovesView'

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
      <TradeCards leagueId={league.id} trades={trades.filter(t => t.season === season)} clubs={clubs} codes={codes} />
    </>
  )
}
