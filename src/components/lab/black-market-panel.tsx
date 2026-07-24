'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ExternalLink, BarChart3, GitCompare, Lightbulb, Download,
  Cpu, GitMerge, Zap, CheckCircle2, AlertTriangle, Ban, Loader2,
} from 'lucide-react'
import type { BlackMarketEntry } from '@/lib/lab/black-market'
import { BadgePill, formatCount, formatDate } from './black-market-card'

// ── Detail side panel ──────────────────────────────────────────────
// Opens when a model card is clicked. Editorial detail + future-action
// affordances (all disabled today — informational page only).

export function BlackMarketPanel({
  entry,
  onClose,
  onAddToIdeas,
  addingToIdeas,
  addedToIdeas,
}: {
  entry: BlackMarketEntry | null
  onClose: () => void
  onAddToIdeas: (entry: BlackMarketEntry) => void
  addingToIdeas: boolean
  addedToIdeas: boolean
}) {
  return (
    <AnimatePresence>
      {entry && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-border bg-surface-base shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-warning/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-warning">
                    Experimental
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{entry.creator}</span>
                </div>
                <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">{entry.name}</h2>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">{entry.hfId}</p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex-shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* Spec grid */}
              <div className="mb-5 grid grid-cols-2 gap-2">
                <SpecItem icon={Cpu} label="Base model" value={entry.baseModel} />
                <SpecItem icon={Cpu} label="Parameters" value={entry.params} />
                <SpecItem icon={BarChart3} label="Downloads" value={entry.stats.ok ? formatCount(entry.stats.downloads) : '—'} />
                <SpecItem icon={Zap} label="Likes" value={entry.stats.ok ? formatCount(entry.stats.likes) : '—'} />
                <SpecItem icon={CheckCircle2} label="License" value={entry.license} />
                <SpecItem icon={BarChart3} label="Updated" value={entry.stats.ok ? formatDate(entry.stats.lastModified) : '—'} />
              </div>

              {/* Badges */}
              <div className="mb-5 flex flex-wrap gap-1.5">
                {entry.badges.map((b) => <BadgePill key={b} badge={b} />)}
              </div>

              {/* Description */}
              <Section title="Description">
                <p className="text-[12px] leading-relaxed text-foreground/80">{entry.description}</p>
              </Section>

              <Section title="Architecture">
                <p className="text-[12px] leading-relaxed text-foreground/70">{entry.architecture}</p>
              </Section>

              {entry.mergeInfo && (
                <Section title="Merge information">
                  <div className="flex items-start gap-2 rounded border border-border bg-surface-secondary p-3">
                    <GitMerge className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <p className="font-mono text-[11px] leading-relaxed text-foreground/70">{entry.mergeInfo}</p>
                  </div>
                </Section>
              )}

              <Section title="Training notes">
                <p className="text-[12px] leading-relaxed text-foreground/70">{entry.trainingNotes}</p>
              </Section>

              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ListBlock title="Strengths" items={entry.strengths} icon={CheckCircle2} tone="primary" />
                <ListBlock title="Weaknesses" items={entry.weaknesses} icon={AlertTriangle} tone="warning" />
              </div>

              <Section title="Known limitations">
                <div className="flex items-start gap-2 rounded border border-warning/20 bg-warning/5 p-3">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
                  <p className="text-[11px] leading-relaxed text-foreground/70">{entry.limitations}</p>
                </div>
              </Section>

              <Section title="Recommended use cases">
                <div className="flex flex-wrap gap-1.5">
                  {entry.useCases.map((u) => (
                    <span key={u} className="rounded border border-border bg-surface-secondary px-2 py-1 font-mono text-[10px] text-foreground/70">
                      {u}
                    </span>
                  ))}
                </div>
              </Section>

              {/* Future benchmark placeholder */}
              <Section title="Enry Benchmark">
                <div className="rounded border border-dashed border-border p-4 text-center">
                  <BarChart3 className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground/40" />
                  <p className="text-[11px] text-muted-foreground">Not yet benchmarked.</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                    When Enry&apos;s benchmark engine is live, measured scores and an Enry Verified badge will appear here.
                  </p>
                </div>
              </Section>
            </div>

            {/* Action footer */}
            <div className="border-t border-border p-4">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://huggingface.co/${entry.hfId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View on Hugging Face
                </a>
                <button
                  onClick={() => onAddToIdeas(entry)}
                  disabled={addingToIdeas || addedToIdeas}
                  className="flex items-center justify-center gap-1.5 rounded border border-border bg-surface-elevated px-3 py-2 font-mono text-[11px] text-foreground transition-colors hover:border-primary/40 disabled:opacity-50"
                >
                  {addingToIdeas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : addedToIdeas ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Lightbulb className="h-3.5 w-3.5" />}
                  {addedToIdeas ? 'Added to Ideas' : 'Add to Ideas'}
                </button>
              </div>
              {/* Future actions — disabled, architected for later wiring */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                <FutureButton icon={BarChart3} label="Benchmark" />
                <FutureButton icon={GitCompare} label="Compare" />
                <FutureButton icon={Download} label="Install" />
              </div>
              <p className="mt-2 text-center font-mono text-[9px] text-muted-foreground/40">
                Install, benchmark &amp; routing arrive once the execution layer ships.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function SpecItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-surface-secondary p-2.5">
      <div className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-2.5 w-2.5" /> {label}
      </div>
      <div className="truncate font-mono text-[11px] text-foreground" title={value}>{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function ListBlock({
  title, items, icon: Icon, tone,
}: {
  title: string
  items: string[]
  icon: React.ComponentType<{ className?: string }>
  tone: 'primary' | 'warning'
}) {
  const color = tone === 'primary' ? 'text-primary' : 'text-warning'
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-1.5">
            <Icon className={`mt-0.5 h-3 w-3 flex-shrink-0 ${color}`} />
            <span className="text-[11px] leading-snug text-foreground/70">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FutureButton({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      disabled
      title="Coming soon"
      className="flex cursor-not-allowed items-center justify-center gap-1 rounded border border-border/50 bg-surface-secondary/50 px-2 py-1.5 font-mono text-[10px] text-muted-foreground/40"
    >
      <Ban className="h-2.5 w-2.5" /> <Icon className="h-2.5 w-2.5" /> {label}
    </button>
  )
}
