'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = { label: string; href: string; exact?: boolean; emoji: string }

// Unified league navigation. Every section is an inline tab: clicking one soft-navigates
// to that route, swapping the content below the persistent header (no full page reload).
export default function LeagueNav({ leagueId, isCommissioner, sideGamesEnabled = true, myTeamId = null }: { leagueId: string; isCommissioner: boolean; sideGamesEnabled?: boolean; myTeamId?: string | null }) {
  const pathname = usePathname()
  const base = `/leagues/${leagueId}`

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
    { label: 'Records', href: `${base}/records`, emoji: '🏅' },
    ...(sideGamesEnabled || isCommissioner ? [{ label: 'Side Games', href: `${base}/sidegames`, emoji: '🎲' }] : []),
    { label: 'Votes', href: `${base}/proposals`, emoji: '🗳️' },
    { label: 'Rules', href: `${base}/rules`, emoji: '📖' },
    { label: 'Transactions', href: `${base}/transactions`, emoji: '🧾' },
    { label: 'Chat', href: `${base}/chat`, emoji: '💬' },
  ]

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  return (
    <div className="sticky top-14 z-30 -mx-4 px-4 bg-white/90 backdrop-blur border-b border-slate-200 mb-6">
      <div className="max-w-6xl mx-auto flex items-center gap-1 overflow-x-auto py-1.5">
        {items.map(item => {
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition flex-shrink-0 ${
                active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="mr-1">{item.emoji}</span>{item.label}
            </Link>
          )
        })}
        {isCommissioner && (
          <Link
            href={`${base}/commish`}
            className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition flex-shrink-0 ml-auto ${
              pathname.startsWith(`${base}/commish`) ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-50'
            }`}
          >
            ⚖️ Commish
          </Link>
        )}
        {isCommissioner && (
          <Link
            href={`${base}/settings`}
            className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition flex-shrink-0 ${
              pathname.startsWith(`${base}/settings`) ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-50'
            }`}
          >
            ⚙️ Settings
          </Link>
        )}
      </div>
    </div>
  )
}
