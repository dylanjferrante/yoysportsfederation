import type { Metadata, Viewport } from 'next'
import { DotGothic16 } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import Navbar from '@/components/Navbar'
import ServiceWorker from '@/components/ServiceWorker'

// Fallback score face; the ticker prefers Bitcount Single (loaded via the
// Google Fonts <link> below — next/font's catalog doesn't include it yet).
const scoreFont = DotGothic16({ subsets: ['latin'], weight: '400', variable: '--font-score' })

export const metadata: Metadata = {
  title: { default: 'yoy Sports Federation', template: '%s | ySF' },
  description: 'Twelve clubs, four leagues, one Federation Cup. The yoy Sports Federation app.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ySF' },
  icons: { icon: '/ysf/fed/favicon.svg', apple: '/icons/apple-touch-icon.png' },
  // link previews (texts, Slack, social): the ySF card
  metadataBase: new URL(process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
  openGraph: { title: 'yoy Sports Federation', description: 'Twelve clubs, four leagues, one Federation Cup.', images: [{ url: '/icons/og.png', width: 1200, height: 630 }], siteName: 'yoy Sports Federation' },
  twitter: { card: 'summary_large_image', images: ['/icons/og.png'] },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={scoreFont.variable}>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/gqo1xyn.css" />
        {/* ySF faces: Shuttleblock (display) + Address Sans Pro (body), Adobe Fonts kit used by ysffantasy.com */}
        <link rel="stylesheet" href="https://use.typekit.net/tbv1jum.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bitcount+Single:wght@300;400&family=Big+Shoulders+Display:wght@500;700;800&display=swap" />
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
