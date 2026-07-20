'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, AlertTriangle, Circle, Loader2, Play, ChevronDown, GitBranch, ExternalLink } from 'lucide-react'
import { isGoalRunActive } from '@/lib/cruise/types'
import type { CruiseAutoJob } from '@/app/api/cruise/autos/route'

// Heartbeat older than this while a run is active is treated as stale — same
// "is this actually alive" signal desktop's cockpit uses, just surfaced as a
// color flip here instead of a live step feed.
const HEARTBEAT_STALE_MS = 10 * 60 * 1000

const RUN_STATUS_LABEL: Record<string, string> = {
  queued: 'queued', planning: 'planning', running: 'working',
  awaiting_clarification: 'needs input', completed: 'completed', capped: 'capped',
  no_changes: 'no changes', build_failed: 'build failing', failed: 'failed', cancelled: 'cancelled',
}

// All three take `now` as a parameter rather than calling Date.now()
// internally — keeps the component's render pure (deterministic given
// props/state), which a direct Date.now() call would violate (and did,
// silently, before this — server and client would compute different
// "now" values on the same render pass, same class of hydration mismatch
// already flagged elsewhere tonight).
export function formatRelative(iso: string | null, now: number): string {
  if (!iso) return 'never'
  const ms = now - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function formatFutureRelative(iso: string | null, now: number): string {
  if (!iso) return 'not scheduled'
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return 'due now'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `in ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `in ${h}h`
  const d = Math.floor(h / 24)
  return `in ${d}d`
}

function scheduleSummary(job: CruiseAutoJob): string {
  const cfg = job.auto_run
  if (!cfg.auto_run_enabled) return 'Auto-run off'
  if (!cfg.auto_run_time || !cfg.auto_run_frequency) return 'Schedule incomplete'
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  if (cfg.auto_run_frequency === 'daily') return `Daily at ${cfg.auto_run_time}`
  if (cfg.auto_run_frequency === 'weekly') return `${WEEKDAYS[cfg.auto_run_weekday ?? 0]}s at ${cfg.auto_run_time}`
  return `Every ${cfg.auto_run_interval_days ?? '?'}d at ${cfg.auto_run_time}`
}

function runDuration(run: NonNullable<CruiseAutoJob['latest_run']>, now: number): string {
  const start = new Date(run.dispatched_at).getTime()
  const end = run.finished_at ? new Date(run.finished_at).getTime() : now
  const s = Math.max(0, Math.round((end - start) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s${run.finished_at ? '' : ' (running)'}`
}

interface CruiseAutoCardProps {
  job: CruiseAutoJob
  onRunNow: (repo: string) => Promise<void>
  onEditSchedule: (job: CruiseAutoJob) => void
}

export function CruiseAutoCard({ job, onRunNow, onEditSchedule }: CruiseAutoCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  // `now` is null on the server and on the very first client render (so SSR
  // and the initial client render match exactly, avoiding a hydration
  // mismatch), then set client-side after mount and refreshed on an
  // interval so heartbeat/duration displays stay live.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const t = setTimeout(tick, 0)
    const interval = setInterval(tick, 30_000)
    return () => { clearTimeout(t); clearInterval(interval) }
  }, [])

  const run = job.latest_run
  const active = run ? isGoalRunActive(run.status) : false
  const heartbeatStale = active && now !== null && (!run?.heartbeat_at || now - new Date(run.heartbeat_at).getTime() > HEARTBEAT_STALE_MS)

  // Status dot: running (fresh) → primary pulse; running (stale heartbeat) →
  // warning; completed → primary check; failed/build_failed → destructive;
  // everything else (capped/no_changes/cancelled/never run) → neutral.
  const StatusIcon = running || active
    ? (heartbeatStale ? AlertTriangle : Loader2)
    : run?.status === 'completed' ? CheckCircle
    : run?.status === 'failed' || run?.status === 'build_failed' ? XCircle
    : Circle
  const statusColor = running || active
    ? (heartbeatStale ? 'text-warning' : 'text-primary')
    : run?.status === 'completed' ? 'text-primary'
    : run?.status === 'failed' || run?.status === 'build_failed' ? 'text-destructive'
    : 'text-muted-foreground/40'
  const spinning = (running || active) && !heartbeatStale

  const handleRun = async () => {
    setRunning(true)
    setRunError(null)
    try {
      await onRunNow(job.repo)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Run failed to start')
    } finally {
      // Refetch (triggered by the parent inside onRunNow) settles the real
      // state; this just clears the optimistic flag after it's had time to
      // land, per spec ("refetch after 3s settles it back").
      setTimeout(() => setRunning(false), 3000)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-xl border border-border bg-surface-secondary p-4"
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start justify-between gap-3 text-left"
        style={{ minHeight: 44 }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <StatusIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${statusColor} ${spinning ? 'animate-spin' : ''}`} />
          <div className="min-w-0">
            <span className="block truncate font-mono text-[11px] font-semibold text-foreground">{job.repo}</span>
            <p className="text-[11px] text-muted-foreground">{scheduleSummary(job)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-right flex-shrink-0">
          <div className="flex flex-col items-end">
            <span className="font-mono text-[9px] text-muted-foreground">{run ? RUN_STATUS_LABEL[run.status] ?? run.status : 'never run'}</span>
            {job.auto_run.auto_run_enabled && now !== null && (
              <span className="font-mono text-[9px] text-muted-foreground/60">next {formatFutureRelative(job.next_run_at, now)}</span>
            )}
          </div>
          <ChevronDown className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-3 space-y-2 overflow-hidden"
        >
          {run && (
            <div className="rounded border border-border bg-surface-elevated px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-foreground">
                <GitBranch className="h-3 w-3 text-muted-foreground" />
                {run.branch_name}
              </div>
              {now !== null && (
                <p className="font-mono text-[9px] text-muted-foreground">
                  Duration: {runDuration(run, now)} · dispatched {formatRelative(run.dispatched_at, now)}
                </p>
              )}
              {heartbeatStale && now !== null && (
                <p className="font-mono text-[9px] text-warning">
                  Heartbeat stale ({run.heartbeat_at ? formatRelative(run.heartbeat_at, now) : 'none'}) — may have stalled
                </p>
              )}
              {run.pr_url && (
                <a
                  href={run.pr_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> View PR
                </a>
              )}
            </div>
          )}

          {runError && (
            <p className="font-mono text-[9px] text-destructive">{runError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleRun() }}
              disabled={running || active}
              className="flex flex-1 items-center justify-center gap-1.5 rounded border border-primary/30 bg-primary/10 py-2 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
              style={{ minHeight: 44 }}
            >
              {running || active ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {running || active ? 'Running…' : 'Run now'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEditSchedule(job) }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border bg-surface-base py-2 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              style={{ minHeight: 44 }}
            >
              Schedule
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
