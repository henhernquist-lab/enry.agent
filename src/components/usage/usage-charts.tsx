'use client'

import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { motion } from 'framer-motion'
import { Activity as ActivityIcon, Coins as CostIcon, Hash as TokenIcon, BarChart3 as BarIcon } from 'lucide-react'
import type { UsageTimeseriesPoint, UsageBreakdownEntry } from '@/lib/usage/types'
import { ChartTooltip } from '@/components/usage/chart-tooltip'
import { formatNumber, formatTokens, formatCost } from '@/lib/usage/format'

function gradientId(id: string) {
  return `usageFill-${id}`
}

function TimeseriesArea({
  data,
  valueKey,
  color,
  format,
  unit,
  delay,
}: {
  data: UsageTimeseriesPoint[]
  valueKey: 'requests' | 'totalTokens' | 'estimatedCostUsd'
  color: string
  format: (v: number) => string
  unit?: string
  delay: number
}) {
  const id = gradientId(valueKey)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded border border-border bg-surface-secondary p-4"
    >
      <div className="h-[130px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              interval={Math.max(0, Math.floor(data.length / 6))}
              tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--color-muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<ChartTooltip valueKey={valueKey} format={format} unit={unit} />}
              cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey={valueKey}
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}

function ChartHeader({ icon: Icon, title, color }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; title: string; color: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" style={{ color }} />
      {title}
    </div>
  )
}

export function RequestsChart({ data, delay }: { data: UsageTimeseriesPoint[]; delay: number }) {
  return (
    <div>
      <ChartHeader icon={ActivityIcon} title="Requests over time" color="var(--color-chart-1)" />
      <TimeseriesArea data={data} valueKey="requests" color="var(--color-chart-1)" format={formatNumber} delay={delay} />
    </div>
  )
}

export function CostChart({ data, delay }: { data: UsageTimeseriesPoint[]; delay: number }) {
  return (
    <div>
      <ChartHeader icon={CostIcon} title="Cost over time" color="var(--color-chart-3)" />
      <TimeseriesArea data={data} valueKey="estimatedCostUsd" color="var(--color-chart-3)" format={formatCost} unit="usd" delay={delay} />
    </div>
  )
}

export function TokensChart({ data, delay }: { data: UsageTimeseriesPoint[]; delay: number }) {
  return (
    <div>
      <ChartHeader icon={TokenIcon} title="Token usage" color="var(--color-chart-2)" />
      <TimeseriesArea data={data} valueKey="totalTokens" color="var(--color-chart-2)" format={formatTokens} unit="tok" delay={delay} />
    </div>
  )
}

const MODEL_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
]

export function TopModelsChart({ data, delay }: { data: UsageBreakdownEntry[]; delay: number }) {
  const chartData = data.map((d) => ({ label: d.label, requests: d.requests }))
  const max = Math.max(1, ...chartData.map((d) => d.requests))
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded border border-border bg-surface-secondary p-4"
    >
      <ChartHeader icon={BarIcon} title="Most used models" color="var(--color-chart-1)" />
      {chartData.length === 0 ? (
        <div className="flex h-[130px] items-center justify-center font-mono text-[10px] text-muted-foreground/50">
          no model usage yet
        </div>
      ) : (
        <div className="h-[130px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 2, right: 8, left: 2, bottom: 0 }}>
              <XAxis type="number" hide domain={[0, max]} />
              <YAxis
                type="category"
                dataKey="label"
                width={92}
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--color-muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-surface-elevated)', opacity: 0.4 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as { label: string; requests: number }
                  return (
                    <div className="rounded border border-border bg-surface-elevated px-2 py-1 font-mono text-[10px] shadow-lg">
                      <span className="text-muted-foreground">{p.label}</span>{' '}
                      <span className="text-primary">{formatNumber(p.requests)}</span>
                    </div>
                  )
                }}
              />
              <Bar dataKey="requests" radius={[2, 2, 2, 2]} isAnimationActive={false}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}

