'use client'

import Link from 'next/link'
import { Car, Radar, Swords, Zap } from 'lucide-react'

export function DriveHeroCard() {
  return (
    <div className="mx-auto max-w-4xl px-8 pt-4 pb-2">
      <div className="group relative overflow-hidden rounded-lg border border-border bg-surface-elevated/60 backdrop-blur-sm transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        {/* Subtle gradient accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-accent/[0.03] pointer-events-none" />

        <div className="relative flex items-center gap-5 px-5 py-4">
          {/* Icon cluster */}
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Swords className="h-5 w-5 text-primary" />
          </div>

          {/* Text content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-sm font-semibold text-foreground">
                Enry Drive
              </h2>
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                18 skills
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              Coding agent with repo context, diff proposals, and skill-driven analysis
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <Link
              href="/agent"
              className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 hover:border-primary/60"
            >
              <Car className="h-3.5 w-3.5" />
              Drive
            </Link>
            <Link
              href="/agent?mode=cruise"
              className="flex items-center gap-1.5 rounded border border-border bg-surface-secondary px-3 py-2 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <Radar className="h-3.5 w-3.5" />
              Cruise
            </Link>
          </div>
        </div>

        {/* Bottom detail strip */}
        <div className="relative border-t border-border/60 px-5 py-2 flex items-center gap-4">
          <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground/60">
            <Zap className="h-2.5 w-2.5" />
            4 LLM models via Enry Engine
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className="font-mono text-[9px] text-muted-foreground/60">
            Propose · apply · commit · PR
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className="font-mono text-[9px] text-muted-foreground/60">
            Multi-skill invocation (up to 4)
          </span>
          <span className="ml-auto font-mono text-[8px] text-muted-foreground/40">
            Ctrl+K → Coding Agent
          </span>
        </div>
      </div>
    </div>
  )
}
