'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import NotificationBell from './NotificationBell'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/leagues',   label: 'Leagues' },
  { href: '/players',   label: 'Players' },
]

export default function Navbar() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="bg-slate-900 text-white sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-14 gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
              <span className="text-white font-black text-xs">NF</span>
            </div>
            <span className="font-bold text-base hidden sm:block">Nexus Fantasy</span>
          </Link>

          {/* Desktop nav */}
          {session && (
            <div className="hidden md:flex items-center gap-1">
              {NAV.map(n => (
                <Link key={n.href} href={n.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname.startsWith(n.href)
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}>
                  {n.label}
                </Link>
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            {session && <NotificationBell />}
            {session ? (
              <div className="relative">
                <button onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 text-sm hover:text-white text-slate-300 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
                    {session.user?.name?.[0]?.toUpperCase()}
                  </div>
                  <span className="hidden sm:block">{session.user?.name}</span>
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white text-slate-900 rounded-xl shadow-lg border border-slate-100 py-1 z-20">
                      <p className="px-4 py-2 text-xs text-slate-400 border-b border-slate-100">{session.user?.email}</p>
                      {NAV.map(n => (
                        <Link key={n.href} href={n.href} className="block px-4 py-2 text-sm hover:bg-slate-50" onClick={() => setMenuOpen(false)}>{n.label}</Link>
                      ))}
                      <Link href="/account" className="block px-4 py-2 text-sm hover:bg-slate-50" onClick={() => setMenuOpen(false)}>Account settings</Link>
                      <div className="border-t border-slate-100 mt-1 pt-1">
                        <button onClick={() => signOut({ callbackUrl: '/' })}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50">
                          Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/auth/login" className="text-sm text-slate-400 hover:text-white px-3 py-1.5">Login</Link>
                <Link href="/auth/register" className="bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors">Join Free</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
