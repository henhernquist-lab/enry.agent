'use client'

import Link from 'next/link'
import { Code2 } from 'lucide-react'

export function AgentLauncher() {
  return (
    <Link
      href="/agent"
      className="flex w-full items-center justify-between rounded border border-border bg-surface-elevated/50 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-surface-elevated"
    >
      <span className="flex items-center gap-2">
        <Code2 className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Agent
        </span>
        <span className="hidden font-mono text-[9px] text-muted-foreground/60 lg:inline">
          Propose &middot; apply &middot; commit &middot; PR
        </span>
      </span>
      <kbd className="font-mono text-[9px] text-muted-foreground">
        Ctrl+K
      </kbd>
    </Link>
  )
}
