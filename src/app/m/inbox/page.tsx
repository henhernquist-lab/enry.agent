'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, AlertTriangle, CheckCircle, Info, ExternalLink } from 'lucide-react'

interface AlertItem {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
  body: string
  time: string
  link?: string
}

const MOCK_ALERTS: AlertItem[] = [
  { id: '1', type: 'success', title: 'Cruise scan complete', body: 'henhernquist-lab/enry.agent — 3 fixes applied, 2 findings flagged for review.', time: '2m ago', link: '/agent' },
  { id: '2', type: 'warning', title: 'Overnight R&D timeout', body: 'Experiment "auto-dependency-pruner" ran 45min without result — marked as dead end.', time: '1h ago' },
  { id: '3', type: 'error', title: 'GitHub token expired', body: 'Cruise scheduled run failed — re-authenticate to resume auto-fixes.', time: '3h ago', link: '/settings' },
  { id: '4', type: 'info', title: 'Memory compaction', body: '215 earlier messages summarized. Key decisions archived.', time: '5h ago' },
]

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

export default function MobileInboxPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header
        className="flex-shrink-0 border-b border-border bg-surface-secondary px-4 py-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">Inbox</span>
        </div>
      </header>

      {/* Pull-to-refresh placeholder */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        <div className="divide-y divide-border/30">
          {MOCK_ALERTS.map((alert) => {
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
                      <span className="flex-shrink-0 font-mono text-[9px] text-muted-foreground">{alert.time}</span>
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

        {MOCK_ALERTS.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <Bell className="mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="font-mono text-xs text-muted-foreground">All clear — no alerts</p>
          </div>
        )}
      </div>
    </div>
  )
}
