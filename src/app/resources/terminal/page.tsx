'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, TerminalSquare, Loader2 } from 'lucide-react'
import { LiveTerminal } from '@/components/terminal/live-terminal'

export default function TerminalPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-transparent">
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link href="/resources" className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Resources
          </Link>
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">live terminal</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Live Terminal</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            read-only · sandboxed · real commands against your repos
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <LiveTerminal />
        </div>
      </main>
    </div>
  )
}
