'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { AlertTriangle, AlertOctagon, Info, X, RefreshCw } from 'lucide-react'
import type { UsageAlert } from '@/lib/usage/types'
import { formatNumber, formatCost } from '@/lib/usage/format'

function severityStyles(sev: UsageAlert['severity']) {
  if (sev === 'critical') return { icon: AlertOctagon, color: 'var(--color-destructive)', border: 'border-destructive/40', bg: 'bg-destructive/10' }
  if (sev === 'warning') return { icon: AlertTriangle, color: 'var(--color-warning)', border: 'border-warning/40', bg: 'bg-warning/10' }
  return { icon: Info, color: 'var(--color-accent)', border: 'border-accent/40', bg: 'bg-accent/10' }
}

function usedLabel(a: UsageAlert): string {
  if (a.unit === 'cost_usd') return `${formatCost(a.used)} / ${formatCost(a.limit)}`
  if (a.unit === 'requests') return `${formatNumber(a.used)} / ${formatNumber(a.limit)}`
  return `${a.used} / ${a.limit}`
}

function AlertBanner({ alert, compact, onDismiss }: { alert: UsageAlert; compact: boolean; onDismiss: (key: string) => void }) {
  const s = severityStyles(alert.severity)
  const Icon = s.icon
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={`flex items-center gap-2.5 rounded border ${s.border} ${s.bg} ${compact ? 'px-3 py-1.5' : 'px-3 py-2'}`}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: s.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-mono ${compact ? 'text-[10px]' : 'text-[11px]'} font-medium text-foreground`}>
            {alert.title}
          </span>
          <span className="font-mono text-[9px] text-muted-foreground/60">{alert.sourceLabel}</span>
        </div>
        {!compact && (
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{alert.message}</p>
        )}
        {compact && (
          <span className="font-mono text-[9px] text-muted-foreground"> {usedLabel(alert)}</span>
        )}
      </div>
      {!compact && (
        <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {usedLabel(alert)}
        </span>
      )}
      <button
        onClick={() => onDismiss(alert.key)}
        className="flex-shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
        aria-label="Dismiss alert"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  )
}

export function UsageAlerts({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const [alerts, setAlerts] = useState<UsageAlert[] | null>(null)
  const reduceMotion = useReducedMotion()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/usage/alerts', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setAlerts(Array.isArray(data.alerts) ? data.alerts : [])
      } else {
        setAlerts([])
      }
    } catch {
      setAlerts((prev) => prev)
    }
  }, [])

  useEffect(() => {
    load()
    // Refresh on window focus (cheap GET) + every 5 min. No polling spam.
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [load])

  const dismiss = useCallback(async (key: string) => {
    // Optimistic removal — instant, no flicker.
    setAlerts((prev) => prev?.filter((a) => a.key !== key) ?? prev)
    try {
      await fetch('/api/usage/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertKey: key }),
      })
    } catch {
      // Swallow — worst case the alert reappears on next focus refresh.
    }
  }, [])

  // Don't render anything until the first load resolves, and render nothing
  // when there are no alerts — keeps the dashboard clean.
  if (!alerts || alerts.length === 0) return null

  return (
    <div className={className}>
      <AnimatePresence>
        {alerts.map((a) => (
          <AlertBanner
            key={a.key}
            alert={a}
            compact={compact}
            onDismiss={dismiss}
          />
        ))}
      </AnimatePresence>
      {!compact && reduceMotion === false && alerts.length > 1 && (
        <div className="mt-1 flex justify-end">
          <button
            onClick={load}
            className="inline-flex items-center gap-1 font-mono text-[9px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            refresh
          </button>
        </div>
      )}
    </div>
  )
}
