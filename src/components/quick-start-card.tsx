'use client'

import Link from 'next/link'
import { MessageSquare, Puzzle, Brain, Swords, ArrowRight } from 'lucide-react'

const STEPS = [
  {
    number: '1',
    title: 'Start a chat',
    desc: 'Ask Enry anything, search the web, or write code.',
    icon: MessageSquare,
    href: '/',
  },
  {
    number: '2',
    title: 'Connect integrations',
    desc: 'Link Gmail, Firecrawl, and more in Settings.',
    icon: Puzzle,
    href: '/settings',
  },
  {
    number: '3',
    title: 'Pick a Focus Mode',
    desc: 'Switch between Brainstorm, Ship, Teacher, or Focus.',
    icon: Brain,
    href: '/',
  },
  {
    number: '4',
    title: 'Ship with Drive',
    desc: 'Open the coding agent to propose, edit, and PR.',
    icon: Swords,
    href: '/agent',
  },
]

export function QuickStartCard() {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-secondary p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Quick Start</h2>
        <p className="text-[11px] text-muted-foreground">Get up and running in a few steps.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STEPS.map((step) => {
          const Icon = step.icon
          return (
            <Link
              key={step.number}
              href={step.href}
              className="group flex items-start gap-3 rounded-lg border border-border/60 bg-surface-elevated/40 p-3 transition-colors hover:border-primary/30 hover:bg-surface-elevated"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                {step.number}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                    {step.title}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/80">{step.desc}</p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
