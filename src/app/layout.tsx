import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Inter, IBM_Plex_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/auth'
import { AmbientBackground } from '@/components/ambient-background'
import { CommandPalette, CommandPaletteHint } from '@/components/command-palette'
import { TerminalOverlay } from '@/components/terminal/terminal-overlay'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ENRY.AGENT | Autonomous AI Operating System',
  description: 'Advanced AI superagent platform for autonomous task execution and intelligent automation',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0b1221',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth()

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable} bg-background`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try {
              const theme = localStorage.getItem('enry-theme');
              if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
              else if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
              else document.documentElement.removeAttribute('data-theme');
            } catch (e) {}`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <AmbientBackground />
        <SessionProvider session={session}>
          {children}
          <CommandPalette />
          <CommandPaletteHint />
          <TerminalOverlay />
        </SessionProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
