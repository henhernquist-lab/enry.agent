'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Bell, AlertTriangle, CheckCircle, Info, ExternalLink } from 'lucide-react'
import type { NotificationItem } from '@/lib/notifications'

const TYPE_ICONS = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertTriangle,
  info: Info,
}

const TYPE_COLORS = {
  success: 'text-primary border-primary/30',
  warning: 'text-warning border-warning/30',
  error: 'text-destructive border-destructive/30',
  info: 'text-accent border-accent/30',
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function MobileInboxPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setItems(data.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header
        className="flex-shrink-0 border-b border-border bg-surface-secondary px-4 py-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">Inbox</span>
          {!loading && items.length > 0 && (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">{items.length}</span>
          )}
        </div>
      </header>

      {/* Pull-to-refresh placeholder */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Bell className="mb-3 h-8 w-8 animate-pulse text-muted-foreground/30" />
            <p className="font-mono text-xs text-muted-foreground">Loading…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <AlertTriangle className="mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="font-mono text-xs text-muted-foreground">Could not load notifications</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Bell className="mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="font-mono text-xs text-muted-foreground">No notifications yet</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground/50">
              Cruise run results and scan completions will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {items.map((alert) => {
              const Icon = TYPE_ICONS[alert.type]
              const colorClass = TYPE_COLORS[alert.type]
              const expanded = expandedId === alert.id

              return (
                <motion.button
                  key={alert.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setExpandedId(expanded ? null : alert.id)}
                  className="flex w-full flex-col px-4 py-3 text-left transition-colors hover:bg-surface-secondary/50"
                  style={{ minHeight: 44 }}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${colorClass.split(' ')[0]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-semibold text-foreground">{alert.title}</span>
                        <span className="flex-shrink-0 font-mono text-[9px] text-muted-foreground">
                          {relativeTime(alert.time)}
                        </span>
                      </div>
                      {expanded && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-1.5 text-xs leading-relaxed text-muted-foreground"
                        >
                          {alert.body}
                        </motion.p>
                      )}
                      {expanded && alert.link && (
                        <a
                          href={alert.link}
                          className="mt-2 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open on desktop
                        </a>
                      )}
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
