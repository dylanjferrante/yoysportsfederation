// ySF Site Redesign — Standings (Fed Cup + the four leagues), from the Nexus database.
import { loadStandings } from '@/lib/ysf-data'
import StandingsView from './StandingsView'

export default async function YsfStandings({ league }: { league: any }) {
  const s = await loadStandings(league)
  const updated = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date())
  return (
    <StandingsView data={{
      leagueId: league.id, season: s.season, updated, live: s.live,
      clubs: Object.fromEntries(Object.values(s.clubs).map(c => [c.id, { name: c.name, abbreviation: c.abbreviation, logo: c.logo, color: c.color }])),
      cup: s.cup, tables: s.tables, lbOpens: s.live.includes('MLB') ? null : 'Mar 24, 2027',
    }} />
  )
}
