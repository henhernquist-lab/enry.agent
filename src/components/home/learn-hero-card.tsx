'use client'

import Link from 'next/link'
import { GraduationCap } from 'lucide-react'

// Same treatment as DriveHeroCard, byte-for-byte — Learn is a peer mode to
// Drive, not a sub-feature, and the homepage entry point should read that way.
export function LearnHeroCard() {
  return (
    <div className="mx-auto max-w-4xl px-8 pt-1">
      <Link
        href="/learn"
        className="group flex items-center gap-2 font-mono text-[11px] text-muted-foreground/60 transition-colors hover:text-primary"
      >
        <GraduationCap className="h-3 w-3" />
        <span className="font-semibold uppercase tracking-wider">Enry Learn</span>
      </Link>
    </div>
  )
}
