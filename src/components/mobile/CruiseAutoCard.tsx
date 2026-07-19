'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Loader2, GitPullRequest, ChevronDown, CalendarClock, AlertTriangle, RotateCcw } from 'lucide-react'
import type { CruiseAutoView } from '@/app/api/cruise/autos/route'
import type { CruiseGoalRunStatus } from '@/lib/cruise/types'

// Status token mapping — anchored in the project's canonical Tailwind palette so
// it stays visually synced with the desktop Cruise panel. "active" is a unique
// animated blue dot for queued/planning/running; "muted" is the never-run gray.
type StatusTone = 'active' | 'success' | 'neutral' | 'warn' | 'fail'

function toneFor(status: CruiseGoalRunStatus | null, enabled: boolean): StatusTone {
  if (!enabled) return 'neutral'
  if (!status) return 'neutral'
  if (status === 'queued' || status === 'planning' || status === 'running') return 'active'
  if (status === 'awaiting_clarification') return 'warn'
  if (status === 'failed' || status === 'build_failed' || status === 'cancelled') return 'fail'
  return 'success' // completed / capped / no_changes
}

const TONE_COLOR: Record<StatusTone, string> = {
  active: 'bg-primary',
  success: 'bg-primary',
  neutral: 'bg-muted-foreground/50',
  warn: 'bg-warning',
  fail: 'bg-destructive',
}

// Pure view-model mapper per D4. Flattens 10+ DB conditions into a single
// JSX-friendly prop bag so the render tree stays readable.
interface CardDisplay {
  tone: StatusTone
  /** Whether the status dot pulses. */
  pulse: boolean
  headline: string
  secondary: string
  runEnabled: boolean
  runLabel: string
  /** Whether the chevron should auto-expand on first paint after a failure. */
  autoExpand: boolean
}

function mapRepoToCard(repo: CruiseAutoView): CardDisplay {
  if (!repo.enabled) {
    return {
      tone: toneFor(null, false),
      pulse: false,
      headline: repo.full_name,
      secondary: 'Cruise disabled',
      runEnabled: false,
      runLabel: 'Disabled',
      autoExpand: false,
    }
  }
  const status = repo.latest_run?.status ?? null
  const tone = toneFor(status, true)

  if (!status) {
    return {
      tone,
      pulse: false,
      headline: repo.full_name,
      secondary: repo.auto_run_enabled ? 'Auto-run scheduled — no runs yet' : 'No runs yet',
      runEnabled: true,
      runLabel: 'Run',
      autoExpand: false,
    }
  }

  if (status === 'queued' || status === 'planning' || status === 'running') {
    return {
      tone,
      pulse: true,
      headline: repo.full_name,
      secondary: repo.latest_run?.remaining_summary || (status === 'queued' ? 'Queued for dispatch…' : `Running — last heartbeat: ${formatRel(repo.latest_run?.heartbeat_at)}`),
      runEnabled: false,
      runLabel: status === 'queued' ? 'Queued' : 'Running',
      autoExpand: false,
    }
  }

  if (status === 'awaiting_clarification') {
    return {
      tone,
      pulse: true,
      headline: repo.full_name,
      secondary: 'Needs a clarifying answer — open on desktop',
      runEnabled: false,
      runLabel: 'Waiting',
      autoExpand: false,
    }
  }

  if (status === 'failed' || status === 'build_failed' || status === 'cancelled') {
    return {
      tone,
      pulse: false,
      headline: repo.full_name,
      secondary: status === 'build_failed' ? 'Build failed on last run' : status === 'cancelled' ? 'Cancelled on last run' : 'Failed on last run',
      runEnabled: true,
      runLabel: 'Re-run',
      autoExpand: true,
    }
  }

  // completed / capped / no_changes
  return {
    tone,
    pulse: false,
    headline: repo.full_name,
    secondary: repo.auto_run_enabled ? `Auto-run scheduled · last run: ${repo.latest_run?.finished_at ? formatRel(repo.latest_run.finished_at) : 'recent'}` : `On-demand only · last run: ${repo.latest_run?.finished_at ? formatRel(repo.latest_run.finished_at) : 'recent'}`,
    runEnabled: true,
    runLabel: 'Run',
    autoExpand: false,
  }
}

// Compact relative-time formatter: "12m ago", "2h ago", "in 3d", "just now".
function formatRel(iso: string | null | undefined): string {
  if (!iso) return 'just now'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'just now'
  const diff = Date.now() - then
  const abs = Math.abs(diff)
  const future = diff < 0
  if (abs < 45_000) return future ? 'soon' : 'just now'
  const mins = Math.floor(abs / 60_000)
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return future ? `in ${hrs}h` : `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`
  return future ? 'in 1mo+' : '1mo+ ago'
}

interface CruiseAutoCardProps {
  repo: CruiseAutoView
  /** Optimistic override — set when the user just tapped [Run]. */
  isOptimisticRunning?: boolean
  onPressRun: (repo: CruiseAutoView) => void
  onPressEdit: (repo: CruiseAutoView) => void
}

export function CruiseAutoCard({ repo, isOptimisticRunning = false, onPressRun, onPressEdit }: CruiseAutoCardProps) {
  const view = isOptimisticRunning
    ? { tone: 'active' as StatusTone, pulse: true, headline: repo.full_name, secondary: 'Dispatching…', runEnabled: false, runLabel: 'Queued', autoExpand: false }
    : mapRepoToCard(repo)
  const [expanded, setExpanded] = useState(view.autoExpand)

  return (
    <div className="rounded-xl border border-border bg-surface-secondary" style={{ minHeight: 44 }}>
      <div className="flex items-start gap-3 p-4">
        {/* Status dot — pulsing on active runs so it reads as "live" without a label. */}
        <div className="relative mt-1.5 flex-shrink-0">
          <span className={`block h-2 w-2 rounded-full ${TONE_COLOR[view.tone]}`} />
          {view.pulse && (
            <motion.span
              className={`absolute inset-0 block h-2 w-2 rounded-full ${TONE_COLOR[view.tone]}`}
              animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
            />
          )}
        </div>

        {/* Body — full_name + schedule summary. font-mono keeps the repo id legible. */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
          aria-expanded={expanded}
        >
          <span className="w-full truncate font-mono text-xs font-semibold text-foreground">{view.headline}</span>
          <span className="w-full truncate text-[11px] leading-relaxed text-muted-foreground">{view.secondary}</span>
        </button>

        {/* Right cluster: [Run] + edit + chevron. 44px tap targets. */}
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!view.runEnabled}
            onClick={(e) => { e.stopPropagation(); onPressRun(repo) }}
            className={`flex h-9 items-center gap-1 rounded px-2.5 text-[11px] font-mono font-semibold uppercase tracking-wide transition-colors ${
              view.runEnabled
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'cursor-not-allowed bg-surface-elevated text-muted-foreground/60'
            }`}
            aria-label={view.runLabel}
            style={{ minWidth: 44 }}
          >
            {isOptimisticRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            <span>{view.runLabel}</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPressEdit(repo) }}
            className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
            aria-label="Edit schedule"
          >
            <CalendarClock className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
              <ChevronDown className="h-4 w-4" />
            </motion.span>
          </button>
        </div>
      </div>

      {/* Expanded region — last run summary, branch/PR link, error excerpt. */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-border"
          >
            <ExpandedBody repo={repo} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ExpandedBody({ repo }: { repo: CruiseAutoView }) {
  const run = repo.latest_run
  if (!run) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <ScheduleLine repo={repo} />
        <p className="font-mono text-[11px] text-muted-foreground">No runs yet. Tap Run to dispatch a scan-and-fix.</p>
      </div>
    )
  }
  const errorExcerpt = run.error ? run.error.slice(0, 280) + (run.error.length > 280 ? '…' : '') : null
  return (
    <div className="flex flex-col gap-2.5 p-4 text-[11px] text-muted-foreground">
      <ScheduleLine repo={repo} />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-wider text-foreground">{run.status.replace(/_/g, ' ')}</span>
        <span className="font-mono text-muted-foreground">{formatRel(run.dispatched_at)}</span>
      </div>
      {run.branch_name && (
        <div className="flex items-center gap-1.5">
          <GitPullRequest className="h-3 w-3 flex-shrink-0" />
          <span className="truncate font-mono">{run.branch_name}</span>
          {run.pr_url && (
            <a
              href={run.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex h-7 items-center gap-1 rounded border border-border px-2 font-mono text-[10px] uppercase tracking-wide text-primary hover:bg-surface-elevated"
              style={{ minHeight: 28 }}
            >
              <GitPullRequest className="h-3 w-3" /> PR #{run.pr_number ?? '?'}
            </a>
          )}
        </div>
      )}
      {errorExcerpt && (
        <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 p-2 text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span className="font-mono leading-relaxed">{errorExcerpt}</span>
        </div>
      )}
      {run.remaining_summary && !errorExcerpt && (
        <p className="font-mono leading-relaxed text-muted-foreground">{run.remaining_summary.slice(0, 240)}{run.remaining_summary.length > 240 ? '…' : ''}</p>
      )}
      {run.status === 'capped' && !run.pr_url && (
        <div className="flex items-center gap-1.5 text-warning">
          <RotateCcw className="h-3 w-3" /> Capped before completion. Re-run to resume.
        </div>
      )}
    </div>
  )
}

function ScheduleLine({ repo }: { repo: CruiseAutoView }) {
  if (!repo.auto_run_enabled) {
    return <p className="font-mono text-[11px] text-muted-foreground">Auto-run OFF — on-demand only.</p>
  }
  const freq = repo.auto_run_frequency ?? 'daily'
  const time = repo.auto_run_time ?? '—'
  const tz = repo.auto_run_tz ?? ''
  let detail = ''
  if (freq === 'weekly') detail = ` · weekday ${repo.auto_run_weekday ?? 0}`
  if (freq === 'every_n_days') detail = ` · every ${repo.auto_run_interval_days ?? 1}d`
  return (
    <p className="font-mono text-[11px] text-muted-foreground">
      Auto-run ON · {freq} @ {time} {tz}{detail} · {repo.auto_run_categories?.length ?? 0} categories
    </p>
  )
}
