import type { Metadata, Viewport } from 'next'
import { Inter, DotGothic16 } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import Navbar from '@/components/Navbar'
import ServiceWorker from '@/components/ServiceWorker'

const inter = Inter({ subsets: ['latin'] })
// Fallback score face; the ticker prefers Bitcount Single (loaded via the
// Google Fonts <link> below — next/font's catalog doesn't include it yet).
const scoreFont = DotGothic16({ subsets: ['latin'], weight: '400', variable: '--font-score' })

export const metadata: Metadata = {
  title: { default: 'Nexus Fantasy', template: '%s | Nexus Fantasy' },
  description: 'The cross-sport fantasy platform. NFL, NBA, NHL, and MLB — trade players and picks across every league.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Nexus' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} ${scoreFont.variable}`}>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/gqo1xyn.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bitcount+Single:wght@300;400&display=swap" />
      </head>
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Navbar />
          <div className="flex-1">{children}</div>
        </Providers>
        <ServiceWorker />
      </body>
    </html>
  )
}
