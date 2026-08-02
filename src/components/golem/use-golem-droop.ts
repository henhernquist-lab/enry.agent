'use client'

import { useEffect, useState } from 'react'

const POLL_MS = 5 * 60_000

/** States at or past the 70% warning threshold defined in tpd-status.ts. */
const DROOPING: ReadonlySet<string> = new Set(['warning', 'critical', 'exhausted'])

interface TpdStatus {
  modelId: string
  state: string
}

/**
 * True when Golem should droop: the model in use is running out of its daily
 * token budget, or the account as a whole has crossed a quota alert.
 *
 * The per-model signal is the interesting one. `/api/models/tpd` reports a
 * rolling-24h rollup per Groq model against GROQ_TPD_LIMITS, and its warning
 * threshold already sits at 70% — deliberately early, because the rollup is a
 * lower bound (failed turns never reach usage_log, and Groq debits
 * prompt + max_tokens while we record completion tokens). Reusing that state
 * instead of re-deriving a threshold here keeps the mascot honest with the
 * picker badge, which reads the same endpoint.
 *
 * The account-wide quota alert is kept as a second trigger: it predates the
 * TPD work and still covers non-Groq models, which have no daily cap to read.
 */
export function useGolemDroop(enabled: boolean, modelId: string | null): boolean {
  const [tpd, setTpd] = useState<TpdStatus[]>([])
  const [accountAlert, setAccountAlert] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setTpd([])
      setAccountAlert(false)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }

    const poll = async () => {
      // Signed out (the login page mounts the mascot too) — stop watching
      // rather than retry a 401 every five minutes.
      let unauthorized = false

      const [tpdRes, alertRes] = await Promise.allSettled([
        fetch('/api/models/tpd'),
        fetch('/api/usage/alerts'),
      ])

      if (tpdRes.status === 'fulfilled') {
        if (tpdRes.value.status === 401) unauthorized = true
        else if (tpdRes.value.ok) {
          try {
            const data = (await tpdRes.value.json()) as { tpd?: TpdStatus[] }
            if (!cancelled) setTpd(data.tpd ?? [])
          } catch {
            /* malformed body — Golem just stands up straight */
          }
        }
      }

      if (alertRes.status === 'fulfilled') {
        if (alertRes.value.status === 401) unauthorized = true
        else if (alertRes.value.ok) {
          try {
            const data = (await alertRes.value.json()) as { alerts?: { severity?: string }[] }
            const crossed = (data.alerts ?? []).some(
              (a) => a.severity === 'warning' || a.severity === 'critical',
            )
            if (!cancelled) setAccountAlert(crossed)
          } catch {
            /* ditto */
          }
        }
      }

      if (unauthorized) stop()
    }

    void poll()
    timer = setInterval(() => void poll(), POLL_MS)

    return () => {
      cancelled = true
      stop()
    }
  }, [enabled])

  // Derived rather than stored, so switching models re-reads the snapshot
  // already in hand: the droop clears the moment Henry moves to a model with
  // headroom, without waiting for the next poll.
  const modelDrooping = modelId
    ? DROOPING.has(tpd.find((t) => t.modelId === modelId)?.state ?? 'ok')
    : false

  return modelDrooping || accountAlert
}
