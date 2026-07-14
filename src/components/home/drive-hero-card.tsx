'use client'

import Link from 'next/link'
import { Swords } from 'lucide-react'

export function DriveHeroCard() {
  return (
    <div className="mx-auto max-w-4xl px-8 pt-3">
      <Link
        href="/agent"
        className="group flex items-center gap-2 font-mono text-[11px] text-muted-foreground/60 transition-colors hover:text-primary"
      >
        <Swords className="h-3 w-3" />
        <span className="font-semibold uppercase tracking-wider">Enry Drive</span>
        <span className="text-muted-foreground/40">
          {'\u00b7'} 4 models via Enry Engine {'\u00b7'} 18 skills {'\u00b7'} multi-skill {'\u00b7'} Ctrl+K {'\u2192'} Coding Agent
        </span>
      </Link>
    </div>
  )
}
