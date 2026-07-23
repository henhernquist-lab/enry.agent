'use client'

import { motion } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Clock, CheckCircle2, AlertCircle, Activity, Server, CalendarClock } from 'lucide-react'
import {
  formatLatency,
  healthStatusColor,
  healthStatusBg,
  healthStatusLabel,
  type ModelHealth,
} from '@/lib/model-intelligence'
import { getModelMeta } from '@/lib/nim'

interface HealthCardProps {
  health: ModelHealth
  index: number
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function SparklineTooltip({ active, payload }: { active?: boolean; payload?: { payload: { hour: string; latencyMs: number } }[] }) {
  if (!active || !payload?.length) return null
  const { latencyMs } = payload[0].payload
  return (
    <div className="rounded border border-border bg-surface-elevated px-2 py-1 font-mono text-[10px] shadow-lg">
      <span className="text-primary">{formatLatency(latencyMs)}</span>
    </div>
  )
}

export function HealthCard({ health, index }: HealthCardProps) {
  const meta = getModelMeta(health.modelId)
  const statusColor = healthStatusColor(health.status)
  const statusBg = healthStatusBg(health.status)
  const statusLabel = healthStatusLabel(health.status)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.35) }}
      whileHover={{ y: -2 }}
      className="rounded-xl border border-border bg-surface-secondary p-5 transition-all duration-200 hover:border-primary/20 hover:bg-surface-elevated"
    >
      {/* Header: name + status badge */}
      <div className="mb-4 flex items-start justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-foreground">{meta?.label ?? health.modelId}</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{meta?.company}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-2.5 py-1">
          <span className={`h-2 w-2 rounded-full ${statusBg} ${health.status === 'online' ? 'animate-pulse-glow' : ''}`} />
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Latency sparkline — only rendered when at least one hour has real data */}
      <div className="mb-4 h-[60px] w-full">
        {health.latencyHistory.some((h) => h.hasData) ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={health.latencyHistory} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={`healthFill-${health.modelId.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip content={<SparklineTooltip />} cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="latencyMs"
                stroke="var(--color-primary)"
                strokeWidth={1.5}
                fill={`url(#healthFill-${health.modelId.replace(/[^a-zA-Z0-9]/g, '')})`}
                isAnimationActive={false}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[10px] text-muted-foreground/50">
            No recent activity
          </div>
        )}
      </div>

      {/* Metrics grid — real values only; "—" when there's nothing to report yet */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border/60 pt-3">
        <Metric icon={Clock} label="Avg latency" value={health.hasData ? formatLatency(health.avgLatencyMs) : '—'} />
        <Metric icon={CheckCircle2} label="Success rate" value={health.hasData ? `${health.successRate}%` : '—'} valueClass={health.hasData && health.successRate >= 95 ? 'text-primary' : 'text-foreground'} />
        <Metric icon={AlertCircle} label="Error rate" value={health.hasData ? `${health.errorRate.toFixed(1)}%` : '—'} valueClass={health.hasData && health.errorRate > 5 ? 'text-warning' : 'text-foreground'} />
        <Metric icon={Activity} label="Requests today" value={String(health.requestsToday)} />
        <Metric icon={Server} label="Provider" value={health.provider} />
        <Metric icon={CalendarClock} label="Last success" value={relativeTime(health.lastSuccessAt)} valueClass={!health.lastSuccessAt ? 'text-muted-foreground/50' : 'text-foreground'} />
      </div>

      {/* Manual override note, if one was set on the Router Status card */}
      {health.statusSource === 'manual' && health.statusNote && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/30 pt-2">
          <Server className="h-2.5 w-2.5 text-muted-foreground/60" />
          <span className="font-mono text-[9px] text-muted-foreground/60">
            manually set: {health.statusNote}
          </span>
        </div>
      )}

      {/* Last failure row (only if there was a failure) */}
      {health.lastFailureAt && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/30 pt-2">
          <AlertCircle className="h-2.5 w-2.5 text-warning/60" />
          <span className="font-mono text-[9px] text-muted-foreground/60">
            last failure {relativeTime(health.lastFailureAt)}
          </span>
        </div>
      )}
    </motion.div>
  )
}

function Metric({ icon: Icon, label, value, valueClass = 'text-foreground' }: { icon: typeof Clock; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <span className={`ml-auto font-mono text-[10px] font-medium ${valueClass}`}>{value}</span>
    </div>
  )
}
