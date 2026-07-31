'use client'

import { useEffect, useState } from 'react'

const POLL_MS = 5 * 60_000

/**
 * True when account usage has crossed its warning threshold — Golem droops.
 *
 * Reads the app's existing quota alerts (`/api/usage/alerts`, thresholds
 * 75/90/95/100 from src/lib/usage/quota.ts). Severity 'warning' is the 75%
 * crossing; 'critical' is 90%+. It clears itself as soon as usage drops back
 * under, because the alert simply stops being returned.
 *
 * NOTE: this is account-wide usage, not per-model token-per-day. There is no
 * TPD endpoint in this codebase to read.
 */
export function useGolemDroop(enabled: boolean): boolean {
  const [droop, setDroop] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setDroop(false)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }

    const poll = async () => {
      try {
        const res = await fetch('/api/usage/alerts')
        // Signed out (the login page mounts the mascot too) — nothing to watch.
        if (res.status === 401) {
          stop()
          return
        }
        if (!res.ok) return
        const data = (await res.json()) as { alerts?: { severity?: string }[] }
        const crossed = (data.alerts ?? []).some(
          (a) => a.severity === 'warning' || a.severity === 'critical',
        )
        if (!cancelled) setDroop(crossed)
      } catch {
        /* offline or route missing — Golem just stands up straight */
      }
    }

    poll()
    timer = setInterval(poll, POLL_MS)

    return () => {
      cancelled = true
      stop()
    }
  }, [enabled])

  return droop
}
