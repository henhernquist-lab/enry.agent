'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, TerminalSquare, Loader2, MessageSquare } from 'lucide-react'
import { LiveTerminal } from '@/components/terminal/live-terminal'
import { TerminalChat } from '@/components/terminal/terminal-chat'

export default function TerminalPage() {
  const { status } = useSession()
  const router = useRouter()
  const [mode, setMode] = useState<'chat' | 'raw'>('chat')

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

          {/* Mode tabs */}
          <div className="flex overflow-x-auto scrollbar-hidden" role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'chat'}
              onClick={() => setMode('chat')}
              className={`relative flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] whitespace-nowrap transition-colors duration-200 ${
                mode === 'chat' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare className="h-3 w-3" />
              Chat
              {mode === 'chat' && (
                <motion.div layoutId="term-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 300, damping: 28 }} />
              )}
            </button>
            <button
              role="tab"
              aria-selected={mode === 'raw'}
              onClick={() => setMode('raw')}
              className={`relative flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] whitespace-nowrap transition-colors duration-200 ${
                mode === 'raw' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <TerminalSquare className="h-3 w-3" />
              Raw Terminal
              {mode === 'raw' && (
                <motion.div layoutId="term-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 300, damping: 28 }} />
              )}
            </button>
          </div>

          <div className="w-8" />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col p-4">
        <div className="min-h-0 flex-1">
          {mode === 'chat' ? <TerminalChat /> : <LiveTerminal />}
        </div>
      </main>
    </div>
  )
}
