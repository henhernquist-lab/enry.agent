'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Radar, Play, Loader2, ChevronRight, ShieldCheck, ShieldOff, AlertTriangle,
  CheckCircle2, XCircle, Ban, RotateCcw, Clock, FileCode, Target, Check,
  MessageCircleQuestion, GitPullRequest, Send,
} from 'lucide-react'
import type {
  CruiseRepo, CruiseScan, CruiseFinding, CruiseSeverity,
  CruiseGoalRun, CruiseGoalStep,
} from '@/lib/cruise/types'
import { isGoalRunActive } from '@/lib/cruise/types'

// Enry Cruise — the autonomous-scan main pane. Phase 1: per-repo allowlist,
// on-demand static scans, report-only, ranked findings with dismiss/not-a-bug.
// Shares the page's repo selector / sidebar; only this pane is Cruise-specific.

const SEV_STYLE: Record<CruiseSeverity, string> = {
  critical: 'text-red-400 border-red-500/40 bg-red-500/10',
  high: 'text-warning border-warning/40 bg-warning/10',
  medium: 'text-accent border-accent/40 bg-accent/10',
  low: 'text-muted-foreground border-border bg-surface-secondary',
  info: 'text-muted-foreground border-border bg-surface-secondary',
}

function isActive(s: CruiseScan['status']): boolean {
  return s === 'queued' || s === 'running'
}

export function CruisePanel({ repo }: { repo: string }) {
  const [config, setConfig] = useState<CruiseRepo | null>(null)
  const [scans, setScans] = useState<CruiseScan[]>([])
  const [selectedScan, setSelectedScan] = useState<string | null>(null)
  const [findings, setFindings] = useState<CruiseFinding[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsReauth, setNeedsReauth] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [goalRuns, setGoalRuns] = useState<CruiseGoalRun[]>([])
  const [goalSteps, setGoalSteps] = useState<Record<string, CruiseGoalStep[]>>({})
  const [goalInput, setGoalInput] = useState('')
  const [goalBusy, setGoalBusy] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [enableNote, setEnableNote] = useState<{ ok: boolean; text: string } | null>(null)

  const loadConfig = useCallback(async () => {
    if (!repo) return
    const res = await fetch('/api/cruise/repos')
    const data = await res.json()
    const rows = (data.repos ?? []) as CruiseRepo[]
    setConfig(rows.find((r) => r.full_name === repo) ?? null)
  }, [repo])

  const loadScans = useCallback(async () => {
    if (!repo) return
    const res = await fetch(`/api/cruise/scans?repo=${encodeURIComponent(repo)}`)
    const data = await res.json()
    const list = (data.scans ?? []) as CruiseScan[]
    setScans(list)
    setSelectedScan((cur) => cur ?? list[0]?.id ?? null)
  }, [repo])

  const loadFindings = useCallback(async (scanId: string) => {
    const res = await fetch(`/api/cruise/findings?scan=${scanId}`)
    const data = await res.json()
    setFindings((data.findings ?? []) as CruiseFinding[])
  }, [])

  const loadGoalRuns = useCallback(async () => {
    if (!repo) return
    const res = await fetch(`/api/cruise/goal-runs?repo=${encodeURIComponent(repo)}`)
    const data = await res.json()
    setGoalRuns((data.runs ?? []) as CruiseGoalRun[])
  }, [repo])

  const loadGoalSteps = useCallback(async (goalRunId: string) => {
    const res = await fetch(`/api/cruise/goal-runs/${goalRunId}`)
    const data = await res.json()
    if (data.run) setGoalRuns((prev) => prev.map((r) => (r.id === goalRunId ? data.run : r)))
    setGoalSteps((prev) => ({ ...prev, [goalRunId]: data.steps ?? [] }))
  }, [])

  // Reset + load whenever the selected repo changes. The resets are
  // synchronous (clearing stale data from the previous repo before the new
  // repo's fetches land) — not a cascading-render risk, just ordering.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(null); setScans([]); setSelectedScan(null); setFindings([]); setError(null); setNeedsReauth(false)
    setGoalRuns([]); setGoalSteps({}); setGoalError(null)
    if (!repo) return
    setLoading(true)
    Promise.all([loadConfig(), loadScans(), loadGoalRuns()]).finally(() => setLoading(false))
  }, [repo, loadConfig, loadScans, loadGoalRuns])

  // Load findings when the selected scan changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedScan) loadFindings(selectedScan)
    else setFindings([])
  }, [selectedScan, loadFindings])

  // Poll while any scan or goal run is in flight, so status + progress update live.
  const hasActive = scans.some((s) => isActive(s.status))
  const activeGoalRuns = goalRuns.filter((r) => isGoalRunActive(r.status))
  const hasActiveGoal = activeGoalRuns.length > 0
  useEffect(() => {
    if (!hasActive && !hasActiveGoal) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = setInterval(() => {
      if (hasActive) { loadScans(); if (selectedScan) loadFindings(selectedScan) }
      if (hasActiveGoal) { loadGoalRuns(); activeGoalRuns.forEach((r) => loadGoalSteps(r.id)) }
    }, 4000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActive, hasActiveGoal, selectedScan, loadScans, loadFindings, loadGoalRuns])

  const enable = async () => {
    setBusy(true); setError(null); setNeedsReauth(false); setEnableNote(null)
    try {
      const res = await fetch('/api/cruise/repos/enable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      })
      const data = await res.json()
      if (res.status === 403 && data.error === 'missing_scope') { setNeedsReauth(true); setError(data.message); return }
      if (!res.ok) { setError(data.message ?? data.error ?? 'Enable failed'); return }
      // Confirmation comes from the server's read-back of the goal workflow.
      setEnableNote(data.goal_workflow_present
        ? { ok: true, text: `Goal-mode runner v${data.goal_workflow_version} confirmed on ${data.default_branch}.` }
        : { ok: false, text: 'Enabled, but the goal-mode workflow is NOT on the default branch — goal runs will fail. Try disable + enable again.' })
      await loadConfig()
    } finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true); setError(null)
    try {
      await fetch('/api/cruise/repos/disable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo }),
      })
      await loadConfig()
    } finally { setBusy(false) }
  }

  const scanNow = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/cruise/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Scan failed to start'); return }
      setSelectedScan(data.scan_id)
      await loadScans()
    } finally { setBusy(false) }
  }

  const runGoal = async () => {
    const goal = goalInput.trim()
    if (!goal) return
    setGoalBusy(true); setGoalError(null)
    try {
      const res = await fetch('/api/cruise/goal-runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo, goal }),
      })
      const data = await res.json()
      if (!res.ok) { setGoalError(data.error ?? 'Goal run failed to start'); return }
      setGoalInput('')
      await loadGoalRuns()
    } finally { setGoalBusy(false) }
  }

  const submitAnswer = async (goalRunId: string, answer: string) => {
    if (!answer.trim()) return
    setGoalBusy(true); setGoalError(null)
    try {
      const res = await fetch(`/api/cruise/goal-runs/${goalRunId}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }),
      })
      const data = await res.json()
      if (!res.ok) { setGoalError(data.error ?? 'Could not submit answer'); return }
      await loadGoalRuns()
    } finally { setGoalBusy(false) }
  }

  const act = async (findingId: string, action: 'dismiss' | 'not_a_bug' | 'reopen') => {
    setFindings((prev) => prev.map((f) => f.id === findingId
      ? { ...f, status: action === 'reopen' ? 'open' : action === 'dismiss' ? 'dismissed' : 'not_a_bug' }
      : f))
    await fetch(`/api/cruise/findings/${findingId}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })
  }

  if (!repo) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-background">
        <p className="font-mono text-[12px] text-muted-foreground/60">Select a repository to use Cruise.</p>
      </div>
    )
  }

  const enabled = !!config?.enabled

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        <div className="mx-auto max-w-[820px] px-8 py-6">
          {/* Header row */}
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
              <Radar className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="font-mono text-[13px] font-semibold text-foreground">Enry Cruise</h1>
              <p className="font-mono text-[10px] text-muted-foreground">autonomous scan · <span className="text-foreground">{repo}</span></p>
            </div>
            <span className="ml-auto rounded border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">report-only</span>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…</div>
          ) : !enabled ? (
            <EnableCard busy={busy} needsReauth={needsReauth} error={error} onEnable={enable} onReauth={() => signIn('github')} repo={repo} />
          ) : (
            <>
              {/* Controls */}
              <div className="mb-5 flex items-center gap-2">
                <button onClick={scanNow} disabled={busy || hasActive}
                  className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40">
                  {hasActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {hasActive ? 'scanning…' : 'Scan now'}
                </button>
                <span className="flex items-center gap-1 font-mono text-[10px] text-primary/70"><ShieldCheck className="h-3 w-3" /> enabled</span>
                <button onClick={disable} disabled={busy}
                  className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40">
                  <ShieldOff className="h-3 w-3" /> disable
                </button>
              </div>

              {error && (
                <div className="mb-4 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                  <span className="font-mono text-[11px] text-destructive">{error}</span>
                </div>
              )}

              {enableNote && (
                <div className={`mb-4 flex items-start gap-2 rounded border px-3 py-2 ${enableNote.ok ? 'border-primary/30 bg-primary/5' : 'border-warning/40 bg-warning/10'}`}>
                  {enableNote.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />}
                  <span className={`font-mono text-[11px] ${enableNote.ok ? 'text-foreground/90' : 'text-warning'}`}>{enableNote.text}</span>
                </div>
              )}

              {/* Goal mode */}
              <div className="mb-6">
                <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Target className="h-3 w-3" /> Goal — autonomous
                </p>
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !hasActiveGoal) runGoal() }}
                    disabled={goalBusy || hasActiveGoal}
                    placeholder='e.g. "fix the lint errors" or "add basic dark mode support"'
                    className="min-w-0 flex-1 rounded border border-border bg-surface-secondary px-3 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none disabled:opacity-40"
                  />
                  <button onClick={runGoal} disabled={goalBusy || hasActiveGoal || !goalInput.trim()}
                    className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40">
                    {hasActiveGoal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
                    {hasActiveGoal ? 'working…' : 'Run'}
                  </button>
                </div>
                <p className="mb-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  Works autonomously on a branch, validates every edit, opens a single PR when done or capped. Caps at {config?.goal_cap_files ?? 10} files / {config?.goal_cap_steps ?? 40} steps. Never touches {repo.split('/')[1] ? 'the default branch' : 'main'} directly.
                </p>
                {goalError && (
                  <div className="mb-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                    <span className="font-mono text-[11px] text-destructive">{goalError}</span>
                  </div>
                )}
                {goalRuns.length > 0 && (
                  <div className="space-y-1.5">
                    {goalRuns.slice(0, 5).map((r) => (
                      <GoalRunCard key={r.id} run={r} steps={goalSteps[r.id] ?? []} onExpand={() => loadGoalSteps(r.id)} onAnswer={submitAnswer} busy={goalBusy} />
                    ))}
                  </div>
                )}
              </div>

              {/* Scan history */}
              {scans.length > 0 && (
                <div className="mb-5">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Scans</p>
                  <div className="space-y-1">
                    {scans.slice(0, 6).map((s) => (
                      <ScanRow key={s.id} scan={s} selected={s.id === selectedScan} onSelect={() => setSelectedScan(s.id)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Findings */}
              <FindingsList findings={findings} scan={scans.find((s) => s.id === selectedScan)} onAct={act} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EnableCard({ busy, needsReauth, error, onEnable, onReauth, repo }: {
  busy: boolean; needsReauth: boolean; error: string | null; onEnable: () => void; onReauth: () => void; repo: string
}) {
  return (
    <div className="rounded-md border border-border bg-surface-secondary p-5">
      <div className="mb-2 flex items-center gap-2">
        <ShieldOff className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-[12px] font-semibold text-foreground">Cruise is off for this repo</span>
      </div>
      <p className="mb-4 max-w-lg font-mono text-[11px] leading-relaxed text-muted-foreground">
        Enabling commits a managed workflow (<span className="text-foreground">.github/workflows/enry-cruise.yml</span>) and a
        static analyzer to <span className="text-foreground">{repo}</span>&apos;s default branch. Nothing scans until you press Scan now, and Phase 1 only ever reports — it never writes fixes.
      </p>
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded border border-warning/40 bg-warning/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
          <span className="font-mono text-[11px] text-warning">{error}</span>
        </div>
      )}
      {needsReauth ? (
        <button onClick={onReauth}
          className="rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20">
          Re-authorize GitHub (grant workflow scope)
        </button>
      ) : (
        <button onClick={onEnable} disabled={busy}
          className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Enable Cruise for this repo
        </button>
      )}
    </div>
  )
}

const GOAL_STATUS_LABEL: Record<CruiseGoalRun['status'], string> = {
  queued: 'queued', planning: 'planning', running: 'working',
  awaiting_clarification: 'needs input', completed: 'completed', capped: 'capped',
  no_changes: 'no changes', failed: 'failed', cancelled: 'cancelled',
}

function GoalRunCard({ run, steps, onExpand, onAnswer, busy }: {
  run: CruiseGoalRun; steps: CruiseGoalStep[]; onExpand: () => void
  onAnswer: (id: string, answer: string) => void; busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState('')
  const active = isGoalRunActive(run.status)

  const icon = run.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
    : run.status === 'capped' ? <AlertTriangle className="h-3.5 w-3.5 text-warning" />
    : run.status === 'failed' ? <XCircle className="h-3.5 w-3.5 text-destructive" />
    : run.status === 'no_changes' ? <Ban className="h-3.5 w-3.5 text-muted-foreground" />
    : run.status === 'awaiting_clarification' ? <MessageCircleQuestion className="h-3.5 w-3.5 text-warning" />
    : <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />

  return (
    <div className="overflow-hidden rounded border border-border bg-surface-secondary">
      <button onClick={() => { const next = !open; setOpen(next); if (next) onExpand() }} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <ChevronRight className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        {icon}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{run.goal}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{GOAL_STATUS_LABEL[run.status]}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t border-border/60 px-3 py-2.5">
              {steps.length > 0 ? (
                <div className="space-y-1 border-l border-border/60 pl-3">
                  {steps.map((s) => (
                    <div key={s.seq} className="flex items-start gap-2 font-mono text-[11px]">
                      {s.status === 'done' ? <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
                        : s.status === 'failed' ? <XCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-destructive" />
                        : s.status === 'running' ? <Loader2 className="mt-0.5 h-3 w-3 flex-shrink-0 animate-spin text-primary" />
                        : <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground/40" />}
                      <div className="min-w-0">
                        <p className={s.status === 'pending' ? 'text-muted-foreground' : 'text-foreground/90'}>{s.description}</p>
                        {s.detail && <p className={`whitespace-pre-wrap text-[10px] ${s.status === 'failed' ? 'text-destructive/80' : 'text-muted-foreground'}`}>{s.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : active ? (
                <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> planning…</p>
              ) : null}

              {run.status === 'no_changes' && (
                <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                  No PR opened — every edit was reverted for introducing type/lint errors, or the goal needed no changes. Expand the failed steps above for the exact errors.
                </p>
              )}

              {run.status === 'awaiting_clarification' && (
                <div className="mt-3 rounded border border-warning/30 bg-warning/5 px-3 py-2">
                  <p className="mb-2 font-mono text-[11px] text-warning">{run.clarify_question}</p>
                  <div className="flex items-center gap-2">
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { onAnswer(run.id, answer); setAnswer('') } }}
                      disabled={busy}
                      placeholder="Answer…"
                      className="min-w-0 flex-1 rounded border border-border bg-surface-secondary px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none disabled:opacity-40"
                    />
                    <button onClick={() => { onAnswer(run.id, answer); setAnswer('') }} disabled={busy || !answer.trim()}
                      className="flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40">
                      <Send className="h-3 w-3" /> Send
                    </button>
                  </div>
                </div>
              )}

              {run.remaining_summary && (
                <div className="mt-3 rounded border border-border px-3 py-2">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Remaining</p>
                  <p className="whitespace-pre-wrap font-mono text-[11px] text-foreground/80">{run.remaining_summary}</p>
                </div>
              )}

              {run.error && <p className="mt-3 font-mono text-[11px] text-destructive">{run.error}</p>}

              {run.pr_url && (
                <a href={run.pr_url} target="_blank" rel="noreferrer"
                  className="mt-3 flex w-fit items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20">
                  <GitPullRequest className="h-3 w-3" /> View PR
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ScanRow({ scan, selected, onSelect }: { scan: CruiseScan; selected: boolean; onSelect: () => void }) {
  const icon = scan.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
    : scan.status === 'failed' ? <XCircle className="h-3.5 w-3.5 text-destructive" />
    : scan.status === 'partial' ? <AlertTriangle className="h-3.5 w-3.5 text-warning" />
    : <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  return (
    <button onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded border px-3 py-1.5 text-left transition-colors ${
        selected ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface-secondary hover:border-primary/20'
      }`}>
      {icon}
      <span className="font-mono text-[11px] text-foreground">{scan.status}</span>
      <span className="font-mono text-[10px] text-muted-foreground">· {scan.trigger}</span>
      <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3" />{new Date(scan.dispatched_at).toLocaleString()}
      </span>
    </button>
  )
}

function FindingsList({ findings, scan, onAct }: {
  findings: CruiseFinding[]; scan?: CruiseScan; onAct: (id: string, a: 'dismiss' | 'not_a_bug' | 'reopen') => void
}) {
  if (!scan) return null
  if (isActive(scan.status) && findings.length === 0) {
    return <p className="font-mono text-[11px] text-muted-foreground">Scan running — findings will stream in…</p>
  }
  if (findings.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded border border-primary/20 bg-primary/5 px-3 py-3">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="font-mono text-[11px] text-foreground">No findings. Clean scan.</span>
      </div>
    )
  }
  const open = findings.filter((f) => f.status === 'open')
  const resolved = findings.filter((f) => f.status !== 'open')
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Findings · <span className="text-foreground">{open.length} open</span>{resolved.length > 0 && ` · ${resolved.length} resolved`}
      </p>
      <div className="space-y-1.5">
        {[...open, ...resolved].map((f) => <FindingCard key={f.id} f={f} onAct={onAct} />)}
      </div>
    </div>
  )
}

function FindingCard({ f, onAct }: { f: CruiseFinding; onAct: (id: string, a: 'dismiss' | 'not_a_bug' | 'reopen') => void }) {
  const [open, setOpen] = useState(false)
  const resolved = f.status !== 'open'
  return (
    <div className={`overflow-hidden rounded border ${resolved ? 'border-border opacity-60' : 'border-border'} bg-surface-secondary`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <ChevronRight className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${SEV_STYLE[f.severity]}`}>{f.severity}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{f.title}</span>
        {f.file_path && (
          <span className="hidden items-center gap-1 font-mono text-[10px] text-muted-foreground sm:flex">
            <FileCode className="h-3 w-3" />{f.file_path.split('/').pop()}{f.line_start ? `:${f.line_start}` : ''}
          </span>
        )}
        {resolved && <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{f.status.replace('_', ' ')}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t border-border/60 px-3 py-2.5">
              {f.file_path && <p className="mb-1.5 font-mono text-[10px] text-muted-foreground">{f.file_path}{f.line_start ? `:${f.line_start}` : ''} · {f.layer} · {Math.round(f.confidence * 100)}% conf</p>}
              <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/90">{f.detail}</p>
              <div className="mt-3 flex items-center gap-1.5">
                {f.status === 'open' ? (
                  <>
                    <button onClick={() => onAct(f.id, 'dismiss')} className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground">
                      <Ban className="h-3 w-3" /> Dismiss
                    </button>
                    <button onClick={() => onAct(f.id, 'not_a_bug')} className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground">
                      <XCircle className="h-3 w-3" /> Not a bug
                    </button>
                  </>
                ) : (
                  <button onClick={() => onAct(f.id, 'reopen')} className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground">
                    <RotateCcw className="h-3 w-3" /> Reopen
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
