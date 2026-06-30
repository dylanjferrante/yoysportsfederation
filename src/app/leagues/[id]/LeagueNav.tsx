'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

type NavItem = { label: string; href: string; exact?: boolean; emoji: string }

// Unified league navigation. Every section is an inline tab: clicking one soft-navigates
// to that route, swapping the content below the persistent header (no full page reload).
// When a past season is being viewed (?season=…), the nav switches to a read-only,
// season-scoped mode: a banner, only the historical tabs, and every link carries the season.
export default function LeagueNav({ leagueId, isCommissioner, sideGamesEnabled = true, myTeamId = null, currentSeason }: { leagueId: string; isCommissioner: boolean; sideGamesEnabled?: boolean; myTeamId?: string | null; currentSeason?: string }) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const base = `/leagues/${leagueId}`
  const viewSeason = sp.get('season')
  const pastMode = !!viewSeason && !!currentSeason && viewSeason !== currentSeason

  const isActive = (item: NavItem) => item.exact ? pathname === item.href : (pathname === item.href || pathname.startsWith(item.href + '/'))
  const tabClass = (active: boolean) => `whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition flex-shrink-0 ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`

  // ── Past-season (read-only) mode ───────────────────────────────────────────
  if (pastMode) {
    const q = `?season=${viewSeason}`
    const items: NavItem[] = [
      { label: 'Standings', href: base, exact: true, emoji: '🏆' },
      { label: 'Teams', href: `${base}/teams`, emoji: '👥' },
      { label: 'Scores', href: `${base}/scores`, emoji: '📊' },
      { label: 'Playoffs', href: `${base}/playoffs`, emoji: '🥇' },
      { label: 'All Seasons', href: `${base}/seasons`, emoji: '📅' },
    ]
    return (
      <div className="sticky top-14 z-30 -mx-4 px-4 bg-amber-50/95 backdrop-blur border-b border-amber-200 mb-6">
        <div className="max-w-6xl mx-auto flex items-center gap-1 overflow-x-auto py-1.5">
          <span className="whitespace-nowrap text-sm font-semibold text-amber-800 mr-2 flex-shrink-0">📅 {viewSeason} season <span className="font-normal text-amber-600">· final standings</span></span>
          {items.map(item => (
            <Link key={item.href} href={item.href + q} className={tabClass(isActive(item))}>
              <span className="mr-1">{item.emoji}</span>{item.label}
            </Link>
          ))}
          <Link href={base} className="whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition flex-shrink-0 ml-auto text-amber-700 hover:bg-amber-100">✕ Exit to current</Link>
        </div>
      </div>
    )
  }

  // ── Normal (current-season) mode ───────────────────────────────────────────
  const items: NavItem[] = [
    { label: 'Standings', href: base, exact: true, emoji: '🏆' },
    ...(myTeamId ? [{ label: 'My Team', href: `${base}/myteam`, emoji: '⭐' }] : []),
    { label: 'Teams', href: `${base}/teams`, emoji: '👥' },
    { label: 'Scores', href: `${base}/scores`, emoji: '📊' },
    { label: 'Players', href: `${base}/waivers`, emoji: '🧑‍🤝‍🧑' },
    { label: 'Trades', href: `${base}/trade`, emoji: '🔁' },
    { label: 'Trade Block', href: `${base}/marketplace`, emoji: '📣' },
    { label: 'Draft', href: `${base}/draft`, emoji: '🎯' },
    { label: 'Mock Draft', href: `${base}/mock`, emoji: '🧪' },
    { label: 'Playoffs', href: `${base}/playoffs`, emoji: '🥇' },
    { label: 'Odds', href: `${base}/odds`, emoji: '📈' },
    { label: 'History', href: `${base}/history`, emoji: '📜' },
    { label: 'Seasons', href: `${base}/seasons`, emoji: '📅' },
    { label: 'Records', href: `${base}/records`, emoji: '🏅' },
    ...(sideGamesEnabled || isCommissioner ? [{ label: 'Side Games', href: `${base}/sidegames`, emoji: '🎲' }] : []),
    { label: 'Votes', href: `${base}/proposals`, emoji: '🗳️' },
    { label: 'Rules', href: `${base}/rules`, emoji: '📖' },
    { label: 'Transactions', href: `${base}/transactions`, emoji: '🧾' },
    { label: 'Chat', href: `${base}/chat`, emoji: '💬' },
  ]

  return (
    <div className="sticky top-14 z-30 -mx-4 px-4 bg-white/90 backdrop-blur border-b border-slate-200 mb-6">
      <div className="max-w-6xl mx-auto flex items-center gap-1 overflow-x-auto py-1.5">
        {items.map(item => (
          <Link key={item.href} href={item.href} className={tabClass(isActive(item))}>
            <span className="mr-1">{item.emoji}</span>{item.label}
          </Link>
        ))}
        {isCommissioner && (
          <Link href={`${base}/commish`} className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition flex-shrink-0 ml-auto ${pathname.startsWith(`${base}/commish`) ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-50'}`}>
            ⚖️ Commish
          </Link>
        )}
        {isCommissioner && (
          <Link href={`${base}/settings`} className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition flex-shrink-0 ${pathname.startsWith(`${base}/settings`) ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-50'}`}>
            ⚙️ Settings
          </Link>
        )}
      </div>
    </div>
  )
}
