'use client'

import { motion } from 'framer-motion'
import { BarChart3, Zap, ArrowUpRight, Sparkles, Shield } from 'lucide-react'
import type { BlackMarketEntry, BlackMarketBadge, DiscoveryBadge } from '@/lib/lab/foundry'

// ── Badge styling ──────────────────────────────────────────────────
// Tone per badge family. Uses design tokens only (no raw Tailwind colors).
const BADGE_TONE: Record<BlackMarketBadge, string> = {
  Experimental:  'bg-warning/10 text-warning border-warning/20',
  Merge:         'bg-primary/10 text-primary border-primary/20',
  'Fine-Tune':   'bg-primary/10 text-primary border-primary/20',
  Reasoning:     'bg-accent/10 text-accent border-accent/20',
  Coding:        'bg-accent/10 text-accent border-accent/20',
  Roleplay:      'bg-surface-elevated text-muted-foreground border-border',
  Vision:        'bg-accent/10 text-accent border-accent/20',
  'Long Context':'bg-surface-elevated text-muted-foreground border-border',
  'Tool Calling':'bg-primary/10 text-primary border-primary/20',
  Uncensored:    'bg-destructive/10 text-destructive border-destructive/20',
  GGUF:          'bg-surface-elevated text-muted-foreground border-border',
  MTP:           'bg-surface-elevated text-muted-foreground border-border',
  // Core model category badges
  General:       'bg-surface-elevated text-muted-foreground border-border',
  Lightweight:   'bg-accent/10 text-accent border-accent/20',
  'Heavy Reasoning':'bg-accent/10 text-accent border-accent/20',
  'Fast Chat':   'bg-accent/10 text-accent border-accent/20',
  'Small High Quality':'bg-primary/10 text-primary border-primary/20',
  // Discovery flair badges
  Trending:      'bg-primary/10 text-primary border-primary/20',
  New:           'bg-accent/10 text-accent border-accent/20',
  'Staff Pick':  'bg-warning/10 text-warning border-warning/20',
  Fast:          'bg-accent/10 text-accent border-accent/20',
  Creative:      'bg-surface-elevated text-muted-foreground border-border',
}

export function BadgePill({ badge }: { badge: BlackMarketBadge }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider ${BADGE_TONE[badge]}`}>
      {badge}
    </span>
  )
}

const DISCOVERY_BADGE_EMOJI: Record<DiscoveryBadge, string> = {
  Trending: '🔥',
  New: '',
  'Staff Pick': '⭐',
  Experimental: '🧪',
  Fast: '⚡',
  Reasoning: '🧠',
  Coding: '💻',
  'Tool Calling': '🛠',
  Creative: '',
}

export function DiscoveryBadgePill({ badge }: { badge: DiscoveryBadge }) {
  return (
    <span className="rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 font-mono text-[8px] text-primary">
      {DISCOVERY_BADGE_EMOJI[badge]} {badge}
    </span>
  )
}

export function formatCount(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function FoundryModelCard({
  entry,
  onOpen,
}: {
  entry: BlackMarketEntry
  onOpen: (entry: BlackMarketEntry) => void
}) {
  const isCore = entry.collection === 'core'
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      onClick={() => onOpen(entry)}
      className="group flex flex-col rounded border border-border bg-surface-secondary p-4 text-left transition-colors hover:border-primary/40"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight text-foreground" title={entry.name}>
            {entry.name}
          </h3>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{entry.creator}</p>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
      </div>

      {/* Collection + discovery badges */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {isCore ? (
          <span className="flex items-center gap-1 rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 font-mono text-[8px] text-primary">
            <Shield className="h-2.5 w-2.5" /> Core
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded border border-accent/20 bg-accent/5 px-1.5 py-0.5 font-mono text-[8px] text-accent">
            <Sparkles className="h-2.5 w-2.5" /> Discovery
          </span>
        )}
        {entry.discoveryBadges.slice(0, 3).map((b) => (
          <DiscoveryBadgePill key={b} badge={b} />
        ))}
      </div>

      <p className="mb-3 line-clamp-2 text-[11px] leading-relaxed text-foreground/60">{entry.description}</p>

      <div className="mb-3 flex flex-wrap gap-1">
        {entry.badges.slice(0, 4).map((b) => <BadgePill key={b} badge={b} />)}
        {entry.badges.length > 4 && (
          <span className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground">
            +{entry.badges.length - 4}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-2.5 font-mono text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1" title="Base model">
          {entry.params} · {entry.baseModel}
        </span>
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-0.5" title="Downloads">
            <BarChart3 className="h-2.5 w-2.5" /> {entry.stats.ok ? formatCount(entry.stats.downloads) : '—'}
          </span>
          <span className="flex items-center gap-0.5" title="Likes">
            <Zap className="h-2.5 w-2.5" /> {entry.stats.ok ? formatCount(entry.stats.likes) : '—'}
          </span>
        </div>
      </div>
    </motion.button>
  )
}
