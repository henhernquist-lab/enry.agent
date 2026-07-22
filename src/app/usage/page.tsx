'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft, BarChart3, Info } from 'lucide-react'
import type { UsageDashboardData, UsageRange } from '@/lib/usage/types'
import { RangeTabs, StatCards } from '@/components/usage/stat-cards'
import { RequestsChart, CostChart, TokensChart, TopModelsChart } from '@/components/usage/usage-charts'
import { UsageBreakdown } from '@/components/usage/usage-breakdown'
import { UsageAlerts } from '@/components/usage/usage-alerts'

export default function UsagePage() {
  const [range, setRange] = useState<UsageRange>('week')
  const [data, setData] = useState<UsageDashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (r: UsageRange) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/usage?range=${r}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch {
      /* keep last-known on transient failure */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(range)
  }, [range, load])

  return (
    <div className="relative flex min-h-screen flex-col bg-transparent">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 grid-overlay opacity-30" />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 0%, rgba(8,8,8,0.6) 100%)' }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          back to enry
        </Link>

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold leading-tight text-foreground">Usage</h1>
              <p className="font-mono text-xs text-muted-foreground">AI usage, cost, and routing analytics</p>
            </div>
          </div>
          <RangeTabs range={range} onChange={setRange} />
        </motion.div>

        {/* Inline usage alerts — no browser alerts, dismissible. */}
        <UsageAlerts className="mb-6 space-y-2" />

        {/* Stat cards */}
        <div className="mb-6">
          <StatCards summary={data?.summary ?? null} loading={loading} />
        </div>

        {/* Charts */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RequestsChart data={data?.timeseries ?? []} delay={0.05} />
          <CostChart data={data?.timeseries ?? []} delay={0.08} />
          <TokensChart data={data?.timeseries ?? []} delay={0.11} />
          <TopModelsChart data={data?.topModels ?? []} delay={0.14} />
        </div>

        {/* Breakdown */}
        <div className="mb-8">
          <UsageBreakdown
            breakdown={data?.breakdown ?? { model: [], provider: [], mode: [] }}
            partial={data?.summary?.partial ?? false}
          />
        </div>

        {/* Partial-data notice */}
        {data?.summary?.partial && (
          <div className="mb-8 flex items-start gap-2 rounded border border-border bg-surface-secondary p-3">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
            <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
              Request counts are derived from skill invocations. Token, cost, and latency
              analytics appear once migration <span className="text-foreground">022_usage_log</span> is applied
              and the chat route accumulates rows.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
