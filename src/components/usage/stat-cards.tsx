'use client'

import { motion } from 'framer-motion'
import { Loader2, Activity, Coins, DollarSign, Clock } from 'lucide-react'
import type { UsageRange, UsageSummary } from '@/lib/usage/types'
import { formatNumber, formatTokens, formatCost, formatLatency } from '@/lib/usage/format'

const RANGES: { id: UsageRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
]

export function RangeTabs({ range, onChange }: { range: UsageRange; onChange: (r: UsageRange) => void }) {
  return (
    <div className="inline-flex items-center rounded border border-border bg-surface-secondary p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          className={`rounded px-3 py-1 font-mono text-[11px] transition-colors ${
            range === r.id
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  delay,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  loading: boolean
  delay: number
  accent?: 'primary' | 'chart2' | 'chart3' | 'chart4'
}) {
  const accentText =
    accent === 'chart2' ? 'text-[var(--color-chart-2)]'
    : accent === 'chart3' ? 'text-[var(--color-chart-3)]'
    : accent === 'chart4' ? 'text-[var(--color-chart-4)]'
    : 'text-primary'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded border border-border bg-surface-secondary p-4"
    >
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${accentText}`} />
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" /> : value}
      </div>
      {sub && <div className="mt-1 font-mono text-[10px] text-muted-foreground">{sub}</div>}
    </motion.div>
  )
}

export function StatCards({ summary, loading }: { summary: UsageSummary | null; loading: boolean }) {
  const s = summary
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={Activity}
        label="Requests"
        value={s ? formatNumber(s.requests) : '—'}
        loading={loading}
        delay={0.02}
        accent="primary"
      />
      <StatCard
        icon={Coins}
        label="Tokens"
        value={s ? formatTokens(s.totalTokens) : '—'}
        sub={s ? `${formatTokens(s.promptTokens)} in · ${formatTokens(s.completionTokens)} out` : undefined}
        loading={loading}
        delay={0.05}
        accent="chart2"
      />
      <StatCard
        icon={DollarSign}
        label="Est. Cost"
        value={s ? formatCost(s.estimatedCostUsd) : '—'}
        sub={s?.partial ? 'cost needs usage_log' : undefined}
        loading={loading}
        delay={0.08}
        accent="chart3"
      />
      <StatCard
        icon={Clock}
        label="Avg Latency"
        value={s ? formatLatency(s.averageLatencyMs) : '—'}
        sub={s?.partial ? 'latency needs usage_log' : undefined}
        loading={loading}
        delay={0.11}
        accent="chart4"
      />
    </div>
  )
}

