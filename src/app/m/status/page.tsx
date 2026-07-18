'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, CheckCircle, AlertTriangle, XCircle, Play, ChevronDown } from 'lucide-react'

interface CronJob {
  id: string
  name: string
  description: string
  status: 'green' | 'yellow' | 'red'
  lastRun: string
  nextRun: string
  lastOutput?: string
  lastDuration?: string
}

const MOCK_JOBS: CronJob[] = [
  { id: '1', name: 'Cruise Auto-Scan', description: 'Scheduled scan-and-fix run', status: 'green', lastRun: '12m ago', nextRun: '3h 48m', lastOutput: '3 fixes applied, 0 failures', lastDuration: '2.1s' },
  { id: '2', name: 'Overnight Reclaim', description: 'Cleanup stale overnight runs', status: 'green', lastRun: '1h ago', nextRun: '23h', lastOutput: '0 stale runs reclaimed', lastDuration: '0.3s' },
  { id: '3', name: 'Memory Compaction', description: 'Summarize old conversation history', status: 'yellow', lastRun: '2h ago', nextRun: '22h', lastOutput: '215 messages compacted — 3 sessions reached threshold', lastDuration: '4.7s' },
  { id: '4', name: 'Skill Prompt Review', description: 'Analyze invocation history for prompt improvements', status: 'red', lastRun: '6h ago', nextRun: '18h', lastOutput: 'Failed: LLM timeout after 60s', lastDuration: '60.0s (timeout)' },
]

const STATUS_ICONS = {
  green: CheckCircle,
  yellow: AlertTriangle,
  red: XCircle,
}

const STATUS_COLORS = {
  green: 'text-primary',
  yellow: 'text-warning',
  red: 'text-destructive',
}

export default function MobileStatusPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header
        className="flex-shrink-0 border-b border-border bg-surface-secondary px-4 py-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">Status</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hidden px-4 py-4">
        <div className="space-y-3">
          {MOCK_JOBS.map((job) => {
            const Icon = STATUS_ICONS[job.status]
            const colorClass = STATUS_COLORS[job.status]
            const expanded = expandedId === job.id

            return (
              <motion.button
                key={job.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setExpandedId(expanded ? null : job.id)}
                className="w-full rounded-xl border border-border bg-surface-secondary p-4 text-left transition-colors hover:border-primary/20"
                style={{ minHeight: 44 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${colorClass}`} />
                    <div>
                      <span className="font-mono text-[11px] font-semibold text-foreground">{job.name}</span>
                      <p className="text-[11px] text-muted-foreground">{job.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-[9px] text-muted-foreground">Last: {job.lastRun}</span>
                      <span className="font-mono text-[9px] text-muted-foreground/60">Next: {job.nextRun}</span>
                    </div>
                    <ChevronDown className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 space-y-2 overflow-hidden"
                  >
                    <div className="rounded border border-border bg-surface-elevated px-3 py-2">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Last output</span>
                      <p className="mt-0.5 font-mono text-[10px] text-foreground">{job.lastOutput}</p>
                      {job.lastDuration && (
                        <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">Duration: {job.lastDuration}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation() }}
                      className="flex w-full items-center justify-center gap-1.5 rounded border border-primary/30 bg-primary/10 py-2 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20"
                      style={{ minHeight: 44 }}
                    >
                      <Play className="h-3 w-3" /> Run now
                    </button>
                  </motion.div>
                )}
              </motion.button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
