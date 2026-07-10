'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Briefcase, RefreshCw, Loader2, ChevronRight, AlertTriangle, Check, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import {
  loadResources,
  updateResource,
  type Resource,
  type BriefingPayload,
} from '@/lib/resources'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const SEVERITY_STYLES: Record<BriefingPayload['flag'] extends undefined ? never : 'low' | 'medium' | 'high', string> = {
  low: 'border-border text-muted-foreground',
  medium: 'border-warning/40 text-warning',
  high: 'border-red-500/40 text-red-400',
}

// Chief of Staff homepage card: today's briefing — observations with tool
// badges, suggested actions as a checklist, and an optional flag. Refreshable
// up to 3×/day (enforced server-side).
export function BriefingCard() {
  const [resource, setResource] = useState<Resource<BriefingPayload> | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    loadResources('briefing').then((rows) => {
      const list = rows as Resource<BriefingPayload>[]
      setResource(list.find((r) => r.payload?.date === todayISO()) ?? list[0] ?? null)
    })

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/briefing/refresh', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Refresh failed')
        return
      }
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const toggleAction = async (idx: number) => {
    if (!resource) return
    const actions = resource.payload.suggested_actions.map((a, i) =>
      i === idx ? { ...a, completed: !a.completed } : a,
    )
    const payload: BriefingPayload = { ...resource.payload, suggested_actions: actions }
    setResource({ ...resource, payload })
    await updateResource(resource.id, 'briefing', resource.title, payload)
  }

  if (loading) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-border bg-surface-secondary">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!resource) {
    return (
      <div className="flex min-h-[180px] flex-col justify-center rounded-lg border border-border bg-surface-secondary p-5">
        <div className="mb-2 flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Today&apos;s Briefing</span>
        </div>
        <p className="text-sm text-muted-foreground">No briefing yet — it generates each morning, or hit refresh to build one now.</p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="mt-3 inline-flex items-center gap-1.5 self-start rounded-md border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-foreground transition-colors hover:border-primary/40 disabled:opacity-40"
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Generate
        </button>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  const p = resource.payload
  const allDone = p.suggested_actions.length > 0 && p.suggested_actions.every((a) => a.completed)

  return (
    <motion.div layout className="rounded-lg border border-border bg-surface-secondary p-5 shadow-sm shadow-black/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Today&apos;s Briefing</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Regenerate briefing (max 3/day)"
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
          <Link
            href="/resources/briefing"
            className="flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            archive <ChevronRight className="h-3 w-3" />
          </Link>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <AnimatePresence initial={false}>
        {collapsed ? (
          <motion.p
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-2 font-mono text-[11px] text-muted-foreground"
          >
            {p.observations.length} observation{p.observations.length !== 1 ? 's' : ''} · {p.suggested_actions.length} action{p.suggested_actions.length !== 1 ? 's' : ''}
            {allDone && ' · all done'}
          </motion.p>
        ) : (
          <motion.div key="expanded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 space-y-4">
            {/* Observations */}
            <div className="space-y-3">
              {p.observations.map((obs, i) => (
                <div key={i} className="space-y-1.5">
                  <p className="text-sm leading-relaxed text-foreground/90">{obs.text}</p>
                  {obs.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {obs.sources.map((s) => (
                        <span
                          key={s}
                          className="rounded border border-border bg-surface-base px-1.5 py-0.5 font-mono text-[9px] lowercase tracking-wide text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Suggested actions checklist */}
            {p.suggested_actions.length > 0 && (
              <div className="border-t border-border/40 pt-3">
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Suggested actions</p>
                <div className="space-y-2">
                  {p.suggested_actions.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => toggleAction(i)}
                      className="flex w-full items-start gap-2 text-left"
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                          action.completed ? 'border-primary bg-primary/20 text-primary' : 'border-border text-transparent'
                        }`}
                      >
                        <Check className="h-2.5 w-2.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`text-sm ${action.completed ? 'text-muted-foreground line-through' : 'text-foreground/90'}`}>
                          {action.text}
                        </span>
                        {action.reason && (
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{action.reason}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Flag */}
            {p.flag && (
              <div className={`flex items-start gap-2 rounded-md border px-3 py-2 ${SEVERITY_STYLES[p.flag.severity]}`}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="text-xs leading-relaxed">{p.flag.text}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
