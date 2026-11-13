'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import NotificationBell from './NotificationBell'
import { YSF_ART, YSF_LEAGUES, U } from '@/lib/ysf'

type Club = { id: string; name: string; abbreviation: string; logo: string | null }
type Item = { label: string; href?: string; menu?: { label: string; href: string; icon?: string | null }[] }

// The ySF header — black bar, ySF wordmark, display-face caps nav with Leagues / Clubs / More
// dropdowns (same structure as ysffantasy.com). Mobile: wordmark + hamburger.
export default function NavbarClient({ clubs, leagueId, strip, commish }: { clubs: Club[]; leagueId: string; strip?: React.ReactNode; commish?: boolean }) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [open, setOpen] = useState<string | null>(null)
  const [mobile, setMobile] = useState(false)
  useEffect(() => { setOpen(null); setMobile(false) }, [pathname])

  const base = `/leagues/${leagueId}`
  const items: Item[] = [
    { label: 'Home', href: base },
    { label: 'Standings', href: `${base}/standings` },
    { label: 'Scores', href: `${base}/scores` },
    { label: 'News', href: `${base}/news` },
    { label: 'Leagues', menu: YSF_LEAGUES.map(l => ({ label: l.code, href: `${base}/sports/${l.sport}`, icon: YSF_ART.leagueSymbol(l.key, 'white') })) },
    { label: 'Clubs', menu: [{ label: 'All clubs', href: `${base}/teams` }, ...clubs.map(c => ({ label: c.name, href: `${base}/teams/${c.id}`, icon: c.logo }))] },
    { label: 'My Club', href: `${base}/myteam` },
    { label: 'Rankings', href: `${base}/power` },
    { label: 'Moves', href: `${base}/transactions` },
    { label: 'Players', href: `${base}/waivers` },
    { label: 'Trades', href: `${base}/trade` },
    {
      label: 'More', menu: [
        { label: 'Cup Race', href: `${base}/cup` }, { label: 'Playoffs', href: `${base}/playoffs` },
        { label: 'Draft', href: `${base}/draft` }, { label: 'History', href: `${base}/history` },
        { label: 'Records', href: `${base}/records` }, { label: 'Injuries', href: `${base}/injuries` }, { label: 'League Office', href: `${base}/rules` },
        { label: 'Votes', href: `${base}/proposals` }, { label: 'Chat', href: `${base}/chat` },
        ...(commish ? [{ label: 'Commissioner', href: `${base}/commish` }, { label: 'League Settings', href: `${base}/settings` }] : []),
      ],
    },
  ]
  const isOn = (it: Item) => it.href
    ? (it.href === base ? pathname === base : pathname.startsWith(it.href))
    : !!it.menu?.some(m => pathname === m.href || (m.href !== base && pathname.startsWith(m.href + '/')))

  return (
    <>
    {/* home page: the score strip runs full width above the menu */}
    {(pathname === `/leagues/${leagueId}` || pathname === '/') && strip}
    <header className="bg-black text-white sticky top-0 z-50 border-b border-ink-800" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-[1240px] mx-auto px-4 sm:px-5 min-h-[60px] flex items-center gap-6">
        <Link href={base} className="flex items-center min-w-0" aria-label="yoy Sports Federation">
          <img src={YSF_ART.wordmarkOnBlack} alt="yoy Sports Federation" className="lg:hidden h-[15px] sm:h-6 w-auto max-w-[62vw]" />
          <img src={YSF_ART.primaryOnBlack} alt="yoy Sports Federation" className="hidden lg:block h-10 w-auto" />
        </Link>

        <nav className="hidden lg:flex items-center gap-4 xl:gap-5 flex-1 ui text-[12px] xl:text-[13px] whitespace-nowrap">
          {items.map(it => it.href ? (
            <Link key={it.label} href={it.href} className={`py-1.5 border-b-2 ${isOn(it) ? 'text-white border-white' : 'text-ink-200 border-transparent hover:text-white'}`}>{U(it.label)}</Link>
          ) : (
            <div key={it.label} className="relative" onMouseEnter={() => setOpen(it.label)} onMouseLeave={() => setOpen(null)}>
              <button type="button" onClick={() => setOpen(open === it.label ? null : it.label)}
                className={`py-1.5 border-b-2 ui whitespace-nowrap ${isOn(it) ? 'text-white border-white' : 'text-ink-200 border-transparent hover:text-white'}`}>{U(it.label)} ▾</button>
              {open === it.label && (
                <div className="absolute left-0 top-full pt-2 z-50">
                  <div className={`bg-white text-black border border-ink-100 shadow-lg py-2 ${it.label === 'Clubs' ? 'w-[300px]' : 'w-[220px]'}`} style={{ borderRadius: 4 }}>
                    {it.menu!.map(m => (
                      <Link key={m.href} href={m.href} className="flex items-center gap-3 px-4 py-2 hover:bg-ink-50 font-sans normal-case tracking-normal text-[15px] font-semibold">
                        {m.icon !== undefined && <span className="w-6 h-6 inline-flex items-center justify-center flex-shrink-0">{m.icon && <img src={m.icon} alt="" className="w-6 h-6 object-contain" />}</span>}
                        <span className="truncate">{m.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {session && <NotificationBell />}
          {session ? (
            <div className="relative hidden sm:block">
              <button onClick={() => setOpen(open === 'me' ? null : 'me')} className="ui text-[13px] text-ink-200 hover:text-white">ACCOUNT ▾</button>
              {open === 'me' && (
                <div className="absolute right-0 mt-2 w-52 bg-white text-black border border-ink-100 shadow-lg py-1 z-50" style={{ borderRadius: 4 }}>
                  <p className="px-4 py-2 text-xs text-ink-400 border-b border-ink-100">{session.user?.email}</p>
                  <Link href="/leagues" className="block px-4 py-2 text-sm hover:bg-ink-50">All leagues</Link>
                  <Link href="/account" className="block px-4 py-2 text-sm hover:bg-ink-50">Account settings</Link>
                  <button onClick={() => signOut({ callbackUrl: '/' })} className="w-full text-left px-4 py-2 text-sm text-[#ba0c2f] hover:bg-ink-50 border-t border-ink-100">Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth/login" className="ui text-[12px] sm:text-[13px] text-white border border-white px-2.5 sm:px-3 h-8 inline-flex items-center justify-center whitespace-nowrap leading-none flex-none" style={{ borderRadius: 8 }}>SIGN IN</Link>
          )}
          <button className="lg:hidden w-10 h-10 inline-flex items-center justify-center" aria-label="Menu" onClick={() => setMobile(!mobile)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">{mobile ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}</svg>
          </button>
        </div>
      </div>

      {mobile && (
        <div className="lg:hidden bg-black border-t border-ink-800 max-h-[80vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {items.map(it => (
            <div key={it.label} className="border-b border-ink-800">
              {it.href
                ? <Link href={it.href} className="block px-5 py-3.5 ui text-[14px] text-white">{U(it.label)}</Link>
                : <>
                    <div className="px-5 pt-3.5 pb-1 ui text-[12px] text-ink-400">{U(it.label)}</div>
                    {it.menu!.map(m => (
                      <Link key={m.href} href={m.href} className="flex items-center gap-3 px-5 py-2.5 text-[15px] font-semibold text-white">
                        {m.label}
                      </Link>
                    ))}
                  </>}
            </div>
          ))}
          {session && <Link href="/account" className="block px-5 py-3.5 ui text-[14px] text-ink-200">ACCOUNT</Link>}
          {session && <button onClick={() => signOut({ callbackUrl: '/' })} className="block w-full text-left px-5 py-3.5 ui text-[14px] text-ink-200">SIGN OUT</button>}
        </div>
      )}
    </header>
    </>
  )
}
