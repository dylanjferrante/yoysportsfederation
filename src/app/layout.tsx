import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import Navbar from '@/components/Navbar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Nexus Fantasy', template: '%s | Nexus Fantasy' },
  description: 'The cross-sport fantasy platform. NFL, NBA, NHL, and MLB — trade players and picks across every league.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Navbar />
          <div className="flex-1">{children}</div>
        </Providers>
      </body>
    </html>
  )
}
