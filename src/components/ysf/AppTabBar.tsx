'use client'

// The ySF app's bottom tab bar (from the App boards), shown on phones and small tablets:
// Home · Scores · Standings · My Club · More. Sits under the ticker.
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const GLYPH: Record<string, React.ReactNode> = {
  home: <path d="M7.6 11.6 12 8l4.4 3.6V16h-2.6v-2.6h-3.6V16H7.6z" />,
  scores: <path d="M7.5 8.5h9v7h-9zM12 8.5v7M7.5 12h9" />,
  standings: <path d="M8.6 15.8v-3.2M12 15.8V8.4M15.4 15.8v-5" />,
  more: <><circle cx="8.6" cy="12" r=".9" /><circle cx="12" cy="12" r=".9" /><circle cx="15.4" cy="12" r=".9" /></>,
}

function Icon({ k, on }: { k: string; on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" className="block">
      <circle cx="12" cy="12" r="11" fill={on ? '#000' : 'none'} stroke={on ? '#000' : 'currentColor'} strokeWidth="1.4" />
      {on && <circle cx="12" cy="12" r="8.6" fill="none" stroke="#fff" strokeWidth="1.2" />}
      <g fill="none" stroke={on ? '#fff' : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={k === 'more' ? '[&_circle]:fill-current' : ''} style={k === 'more' ? { color: on ? '#fff' : undefined } : undefined}>{GLYPH[k]}</g>
    </svg>
  )
}

const MORE = ['/more', '/transactions', '/power', '/cup', '/history', '/report', '/news', '/injuries', '/rules', '/draft', '/teams', '/sports', '/trade', '/waivers', '/proposals', '/records', '/seasons', '/chat', '/marketplace', '/playoffs']

export default function AppTabBar({ leagueId, myLogo }: { leagueId: string; myLogo: string | null }) {
  const path = usePathname() ?? ''
  const base = `/leagues/${leagueId}`
  const rest = path.startsWith(base) ? path.slice(base.length) : path
  const on = rest === '' ? 'home' : rest.startsWith('/scores') ? 'scores' : rest.startsWith('/standings') ? 'standings' : rest.startsWith('/myteam') ? 'club' : MORE.some(m => rest.startsWith(m)) ? 'more' : ''
  const tabs: [string, string, string][] = [['home', 'Home', base], ['scores', 'Scores', `${base}/scores`], ['standings', 'Standings', `${base}/standings`], ['club', 'My Club', `${base}/myteam`], ['more', 'More', `${base}/more`]]
  return (
    <nav className="lg:hidden grid grid-cols-5 bg-white/95 backdrop-blur border-t border-ink-100 pt-1.5 pb-1" aria-label="App">
      {tabs.map(([k, label, href]) => (
        <Link key={k} href={href} className={`flex flex-col items-center justify-center gap-[3px] text-[10px] font-medium leading-none ${on === k ? 'text-black' : 'text-ink-400'}`} aria-current={on === k ? 'page' : undefined}>
          {k === 'club'
            ? <span className="w-7 h-7 inline-flex items-center justify-center">{myLogo ? <img src={myLogo} alt="" className="w-[26px] h-[26px] object-contain" /> : <Icon k="home" on={false} />}</span>
            : <Icon k={k} on={on === k} />}
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  )
}
