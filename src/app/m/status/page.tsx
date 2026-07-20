'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Loader2, RefreshCw } from 'lucide-react'
import { CruiseAutoCard } from '@/components/mobile/CruiseAutoCard'
import { CruiseScheduleSheet } from '@/components/mobile/CruiseScheduleSheet'
import type { CruiseAutoJob } from '@/app/api/cruise/autos/route'

// Cruise Auto-run management for enry lite. Reads/writes the SAME
// cruise_repos / cruise_goal_runs state desktop's AutoRunPanel does — no
// mobile-only scheduler path, no separate schema. See LEARN.md-adjacent
// contract: /api/cruise/autos (read), /api/cruise/repos/autorun (schedule
// write), /api/cruise/goal-runs (manual run trigger).

const PULL_THRESHOLD = 70

export default function MobileStatusPage() {
  const [jobs, setJobs] = useState<CruiseAutoJob[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scheduleJob, setScheduleJob] = useState<CruiseAutoJob | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const pullStartY = useRef<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/cruise/autos')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setError(null)
      setJobs(data.jobs ?? [])
    } catch {
      setError('Network error loading Cruise status')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { setTimeout(fetchJobs, 0) }, [fetchJobs])

  const runNow = useCallback(async (repo: string) => {
    const res = await fetch('/api/cruise/goal-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Run failed to start')
    // Real state (queued/running, real heartbeat) replaces the card's
    // optimistic "running…" flip once this lands.
    setTimeout(() => { fetchJobs() }, 3000)
  }, [fetchJobs])

  const openSchedule = useCallback((job: CruiseAutoJob) => {
    setScheduleJob(job)
    setSheetOpen(true)
  }, [])

  // Minimal touch-based pull-to-refresh — only engages when the scroll
  // container is already at the top (so it never fights normal scrolling).
  const onTouchStart = (e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop <= 0) {
      pullStartY.current = e.touches[0].clientY
    }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (pullStartY.current == null) return
    const delta = e.touches[0].clientY - pullStartY.current
    if (delta > 0) setPullDistance(Math.min(delta, PULL_THRESHOLD * 1.5))
  }
  const onTouchEnd = () => {
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true)
      fetchJobs()
    }
    pullStartY.current = null
    setPullDistance(0)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header
        className="flex-shrink-0 border-b border-border bg-surface-secondary px-4 py-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">Status</span>
          </div>
          <button
            onClick={() => { setRefreshing(true); fetchJobs() }}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Refresh"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-hidden px-4 py-4"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {pullDistance > 0 && (
          <div className="flex items-center justify-center py-2" style={{ opacity: Math.min(pullDistance / PULL_THRESHOLD, 1) }}>
            <RefreshCw className={`h-4 w-4 text-primary ${pullDistance >= PULL_THRESHOLD ? 'animate-spin' : ''}`} />
          </div>
        )}

        {loading && !jobs && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <p className="py-8 text-center font-mono text-[11px] text-destructive">{error}</p>
        )}

        {!loading && !error && jobs && jobs.length === 0 && (
          <div className="py-12 text-center">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/50">No Cruise repos enabled</p>
            <p className="mt-2 font-sans text-[12px] text-muted-foreground/40">Enable Cruise for a repo on desktop to manage its auto-run schedule here.</p>
          </div>
        )}

        {jobs && jobs.length > 0 && (
          <div className="space-y-3">
            {jobs.map((job) => (
              <CruiseAutoCard key={job.repo} job={job} onRunNow={runNow} onEditSchedule={openSchedule} />
            ))}
          </div>
        )}
      </div>

      <CruiseScheduleSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        job={scheduleJob}
        onSaved={fetchJobs}
      />
    </div>
  )
}
