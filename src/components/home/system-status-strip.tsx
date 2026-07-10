'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { onResourceSaved } from '@/lib/resource-events'

interface SystemStatus {
  modelsReady: number
  modelsTotal: number
  resourceCount: number
  lastSync: string | null
}

function relativeSync(iso: string | null, now: number): string {
  if (!iso) return 'no activity yet'
  const secs = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function Dot({ pulsing }: { pulsing: boolean }) {
  return (
    <span className="relative flex h-1.5 w-1.5 items-center justify-center">
      <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(0,255,102,0.6)]" />
      <AnimatePresence>
        {pulsing && (
          <motion.span
            className="absolute h-1.5 w-1.5 rounded-full bg-primary"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 3.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }}
          />
        )}
      </AnimatePresence>
    </span>
  )
}

const Sep = () => <span className="text-border">●</span>

export function SystemStatusStrip() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [pulsing, setPulsing] = useState(false)
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/system/status')
      if (!res.ok) return
      setStatus(await res.json())
    } catch {
      /* leave last-known status in place on a transient failure */
    }
  }, [])

  // Initial load + 60s poll + refetch on window focus. The initial fetch is
  // deferred a tick so the effect body itself doesn't set state synchronously.
  useEffect(() => {
    const initial = setTimeout(refetch, 0)
    const interval = setInterval(refetch, 60_000)
    const onFocus = () => refetch()
    window.addEventListener('focus', onFocus)
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [refetch])

  // Tick the "synced Xago" label without a refetch.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 3000)
    return () => clearInterval(t)
  }, [])

  // Pulse + refetch the count when a save fires anywhere via the shared helpers.
  useEffect(() => {
    return onResourceSaved(() => {
      setPulsing(true)
      if (pulseTimer.current) clearTimeout(pulseTimer.current)
      pulseTimer.current = setTimeout(() => setPulsing(false), 650)
      refetch()
    })
  }, [refetch])

  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface-secondary/80 px-4 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur">
      <Dot pulsing={pulsing} />
      <span className="font-medium text-foreground">enry</span>
      <Sep />
      <span>
        <span className={status && status.modelsReady === status.modelsTotal ? 'text-primary' : 'text-warning'}>
          {status ? status.modelsReady : '—'}
        </span>
        /{status ? status.modelsTotal : 4} models ready
      </span>
      <Sep />
      <span>
        <span className="text-foreground">{status ? status.resourceCount : '—'}</span> resources saved
      </span>
      <Sep />
      <span>synced {status ? relativeSync(status.lastSync, now) : '…'}</span>
    </div>
  )
}
