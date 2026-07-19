'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, RefreshCw, Play, Power, AlertTriangle, Loader2 } from 'lucide-react'
import { CruiseAutoCard } from '@/components/mobile/CruiseAutoCard'
import { CruiseScheduleSheet } from '@/components/mobile/CruiseScheduleSheet'
import type { CruiseAutoView } from '@/app/api/cruise/autos/route'

// enry-lite Status tab — read-write Cruise management surface.
//
// Replaces the original MOCK_JOBS hardcoded tab. Fetches GET /api/cruise/autos
// (read-only aggregator returning cruise_repos joined with the latest
// cruise_goal_runs per repo). Wires Run Now through POST /api/cruise/goal-runs
// (the same route the desktop Cruise panel uses, same response shape), and
// Schedule Editing through /api/cruise/repos/autorun — single source of truth,
// no mobile-only parallel routes.
//
// State machine per D3 design: optimistic flip to "Dispatching…" while the
// POST is in flight; on 2xx, start 4s polling (matches desktop cadence) until
// the run settles; on non-2xx, revert the optimistic stamp and surface the
// server error inline.

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; repos: CruiseAutoView[] }

export default function MobileStatusPage() {
  const [state, setState] = useState<FetchState>({ kind: 'loading' })
  const [editingRepo, setEditingRepo] = useState<CruiseAutoView | null>(null)
  const [optimisticForRepoId, setOptimisticForRepoId] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch('/api/cruise/autos', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setState({ kind: 'error', message: 'Not signed in.' })
        return
      }
      if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : `Load failed (${res.status})`
        setState({ kind: 'error', message: msg })
        return
      }
      const repos = Array.isArray(data.repos) ? (data.repos as CruiseAutoView[]) : []
      setState({ kind: 'loaded', repos })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' })
    }
  }, [])

  // First load.
  useEffect(() => { fetchAll() }, [fetchAll])

  // Poll while any repo's latest_run is in-flight. Matches desktop's 4s cadence
  // so a Run Now dispatched from mobile sees the same refresh rate as one from
  // the desktop Cruise panel.
  useEffect(() => {
    if (state.kind !== 'loaded') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    const hasActive = state.repos.some((r) => {
      const s = r.latest_run?.status
      return s === 'queued' || s === 'planning' || s === 'running' || s === 'awaiting_clarification'
    })
    if (!hasActive) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = setInterval(() => { fetchAll() }, 4000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [state, fetchAll])

  // Stop the optimistic run stamp once a fresh /api/cruise/autos read shows
  // the dispatched run has landed in latest_run.
  useEffect(() => {
    if (!optimisticForRepoId || state.kind !== 'loaded') return
    const repo = state.repos.find((r) => r.id === optimisticForRepoId)
    if (!repo) return
    const s = repo.latest_run?.status
    if (s === 'queued' || s === 'planning' || s === 'running' || s === 'awaiting_clarification') {
      setOptimisticForRepoId(null) // server confirms; optimistic run is real now
    }
  }, [state, optimisticForRepoId])

  const handleRunNow = useCallback(async (repo: CruiseAutoView) => {
    setRunError(null)
    setOptimisticForRepoId(repo.id)
    try {
      const res = await fetch('/api/cruise/goal-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.full_name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Surface server message. Common cases:
        //  403 Cruise not enabled, 400 NEXTAUTH_URL missing for callbacks,
        //  400 missing GH token, 401 unauthenticated.
        const msg = typeof data.error === 'string' ? data.error : `Run dispatch failed (${res.status}).`
        setRunError(msg)
        setOptimisticForRepoId(null) // optimistic does NOT survive a failed dispatch
        return
      }
      // Server queued us. Optimistic stamp stays on until a polling tick
      // confirms the run is now visible in latest_run (effect above).
      // Pull a fresh snapshot in case the polling hasn't started yet.
      setTimeout(() => { fetchAll() }, 600)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Network error')
      setOptimisticForRepoId(null)
    }
  }, [fetchAll])

  const handleEdit = useCallback((repo: CruiseAutoView) => {
    setEditingRepo(repo)
  }, [])

  const handleSheetClose = useCallback(() => {
    setEditingRepo(null)
  }, [])

  const handleSheetSaved = useCallback(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Header — Activity glyph + Status label + manual refresh button (taps
          as a fallback for pull-to-refresh on phones that don't gesture-down). */}
      <header
        className="flex flex-shrink-0 items-center justify-between border-b border-border bg-surface-secondary px-4 py-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">Status</span>
        </div>
        <button
          type="button"
          onClick={() => fetchAll()}
          disabled={state.kind === 'loading'}
          className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
          aria-label="Refresh"
          style={{ minHeight: 44 }}
        >
          <RefreshCw className={`h-4 w-4 ${state.kind === 'loading' ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Toast zone — non-blocking error from Run Now. Stays until next action. */}
      <AnimatePresence>
        {runError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mx-4 mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-[11px] text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span className="font-mono leading-relaxed">{runError}</span>
            <button type="button" onClick={() => setRunError(null)} className="ml-auto text-destructive/80 hover:text-destructive">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body — single scrollable region with safe-area bottom inset. */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        {state.kind === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-mono text-[11px]">Loading…</span>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="font-mono text-[11px] text-destructive">{state.message}</p>
            <button
              type="button"
              onClick={() => fetchAll()}
              className="flex h-9 items-center gap-1.5 rounded border border-border bg-surface-elevated px-3 font-mono text-[11px] text-foreground hover:border-primary/40"
              style={{ minHeight: 44 }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {state.kind === 'loaded' && state.repos.length === 0 && (
          <EmptyState />
        )}

        {state.kind === 'loaded' && state.repos.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {state.repos.map((repo) => (
              <CruiseAutoCard
                key={repo.id}
                repo={repo}
                isOptimisticRunning={optimisticForRepoId === repo.id}
                onPressRun={handleRunNow}
                onPressEdit={handleEdit}
              />
            ))}
            <p className="mt-2 px-1 text-center font-mono text-[10px] text-muted-foreground/70">
              Tap the calendar icon to edit schedule. Tap Run to dispatch a scan-and-fix on demand.
            </p>
          </div>
        )}
      </div>

      <CruiseScheduleSheet
        open={editingRepo !== null}
        repo={editingRepo}
        onClose={handleSheetClose}
        onSaved={handleSheetSaved}
      />
    </div>
  )
}

// Friendly first-run state — no Cruise allowlist yet. Directs the user back
// to the desktop where the scan workflow gets installed per-repo.
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <Power className="h-5 w-5 text-muted-foreground" />
      <p className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">No Cruise repos yet</p>
      <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
        Cruise is enabled per-repo from the desktop. Open the Cruise panel on <span className="font-mono">/agent</span>,
        pick a repo, and run <span className="font-mono">Enable Cruise</span> once. This tab will populate as you add repos.
      </p>
    </div>
  )
}
