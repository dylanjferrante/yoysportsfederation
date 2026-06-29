'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useState } from 'react'

export default function Navbar() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)

  return (
    <nav className="bg-ysf-navy text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-ysf-gold flex items-center justify-center text-ysf-navy font-black text-sm">
                YSF
              </div>
              <span className="font-bold text-lg tracking-tight hidden sm:block">
                Fantasy Federation
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              <Link href="/dashboard" className="text-gray-300 hover:text-white transition-colors">
                Dashboard
              </Link>
              <Link href="/leagues" className="text-gray-300 hover:text-white transition-colors">
                Leagues
              </Link>
              <Link href="/players" className="text-gray-300 hover:text-white transition-colors">
                Players
              </Link>
              <Link href="/trade" className="text-gray-300 hover:text-white transition-colors">
                Trade Center
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {session ? (
              <div className="relative">
                <button
                  onClick={() => setOpen(!open)}
                  className="flex items-center gap-2 text-sm hover:text-ysf-gold transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-ysf-blue flex items-center justify-center text-xs font-bold">
                    {session.user?.name?.[0]?.toUpperCase()}
                  </div>
                  <span className="hidden sm:block">{session.user?.name}</span>
                </button>
                {open && (
                  <div className="absolute right-0 mt-2 w-48 bg-white text-gray-900 rounded-xl shadow-lg border border-gray-100 py-1">
                    <Link
                      href="/dashboard"
                      className="block px-4 py-2 text-sm hover:bg-gray-50"
                      onClick={() => setOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <button
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/auth/login"
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/auth/register"
                  className="btn-gold text-sm py-1.5 px-3"
                >
                  Join Now
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
