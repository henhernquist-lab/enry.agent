'use client'

import { motion } from 'framer-motion'
import { ShieldCheck, AlertTriangle, ShieldOff, HelpCircle, Activity, Clock } from 'lucide-react'
import { formatLatency, type ModelHealth } from '@/lib/model-intelligence'

interface HealthOverviewProps {
  healths: ModelHealth[]
}

export function HealthOverview({ healths }: HealthOverviewProps) {
  const online = healths.filter((h) => h.status === 'online').length
  const slow = healths.filter((h) => h.status === 'slow').length
  const offline = healths.filter((h) => h.status === 'offline').length
  const unknown = healths.filter((h) => h.status === 'unknown').length
  const totalRequests = healths.reduce((sum, h) => sum + h.requestsToday, 0)

  // Average only over models that actually have data — mixing in zeros
  // from unmeasured models would understate the real latency.
  const withData = healths.filter((h) => h.hasData)
  const avgLatency = withData.length
    ? Math.round(withData.reduce((sum, h) => sum + h.avgLatencyMs, 0) / withData.length)
    : null

  const stats = [
    { label: 'Online', value: online, icon: ShieldCheck, color: 'text-primary', bg: 'bg-primary' },
    { label: 'Slow', value: slow, icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning' },
    { label: 'Offline', value: offline, icon: ShieldOff, color: 'text-destructive', bg: 'bg-destructive' },
    { label: 'No data', value: unknown, icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted-foreground' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-xl border border-border bg-surface-secondary p-5"
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated">
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div>
              <p className={`font-mono text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated">
            <Activity className="h-4 w-4 text-accent" />
          </div>
          <div>
            <p className="font-mono text-lg font-bold text-foreground">{totalRequests}</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Requests today</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-mono text-lg font-bold text-foreground">{avgLatency !== null ? formatLatency(avgLatency) : '—'}</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Avg latency</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
