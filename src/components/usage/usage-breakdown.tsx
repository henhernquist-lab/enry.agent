'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BreakdownDimension, UsageBreakdownEntry } from '@/lib/usage/types'
import { formatNumber, formatTokens, formatCost } from '@/lib/usage/format'

const DIMENSIONS: { id: BreakdownDimension; label: string }[] = [
  { id: 'model', label: 'Model' },
  { id: 'provider', label: 'Provider' },
  { id: 'mode', label: 'Mode' },
]

function BreakdownRow({ entry, index, partial }: { entry: UsageBreakdownEntry; index: number; partial: boolean }) {
  const pct = Math.round(entry.share * 100)
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25) }}
      className="py-2"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-foreground">{entry.label}</span>
        <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatNumber(entry.requests)}
          <span className="ml-1 text-muted-foreground/50">{pct}%</span>
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
        <motion.div
          className="h-full rounded-full bg-primary/70"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
        />
      </div>
      {!partial && (entry.totalTokens > 0 || entry.estimatedCostUsd > 0) && (
        <div className="mt-0.5 flex items-center gap-3 font-mono text-[9px] text-muted-foreground/60">
          {entry.totalTokens > 0 && <span>{formatTokens(entry.totalTokens)} tok</span>}
          {entry.estimatedCostUsd > 0 && <span>{formatCost(entry.estimatedCostUsd)}</span>}
        </div>
      )}
    </motion.div>
  )
}

export function UsageBreakdown({
  breakdown,
  partial,
}: {
  breakdown: Record<BreakdownDimension, UsageBreakdownEntry[]>
  partial: boolean
}) {
  const [dim, setDim] = useState<BreakdownDimension>('model')
  const entries = breakdown[dim] ?? []

  return (
    <div className="rounded border border-border bg-surface-secondary p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Breakdown
        </h2>
        <div className="inline-flex items-center rounded border border-border bg-background p-0.5">
          {DIMENSIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDim(d.id)}
              className={`rounded px-2.5 py-0.5 font-mono text-[10px] transition-colors ${
                dim === d.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex h-24 items-center justify-center font-mono text-[10px] text-muted-foreground/50">
          no {dim} data for this range
        </div>
      ) : (
        <div className="divide-y divide-border">
          <AnimatePresence mode="popLayout">
            {entries.map((e, i) => (
              <BreakdownRow key={e.key} entry={e} index={i} partial={partial} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
