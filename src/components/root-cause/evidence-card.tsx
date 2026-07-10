'use client'

import { Database } from 'lucide-react'
import type { EvidenceCard as EvidenceCardType } from '@/lib/root-cause'

// A small inline data card shown during the interview — "Your check-in ratings:
// 3, 2, 2, 4 over the 4 days before". Grounds every claim in real logged data.
export function EvidenceCard({ card }: { card: EvidenceCardType }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-surface-base px-3 py-2">
      <Database className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary/70" />
      <div className="min-w-0">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{card.label}</span>
        <p className="text-xs leading-snug text-foreground/90">{card.detail}</p>
      </div>
    </div>
  )
}

// Evidence as raw strings (from a model turn) rendered the same way.
export function EvidenceList({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div className="space-y-1.5">
      {items.map((e, i) => (
        <div key={i} className="flex items-start gap-2 rounded-md border border-border bg-surface-base px-3 py-1.5">
          <Database className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary/70" />
          <p className="text-xs leading-snug text-foreground/90">{e}</p>
        </div>
      ))}
    </div>
  )
}
