'use client'

import type { UsageTimeseriesPoint } from '@/lib/usage/types'

export interface ChartTooltipProps {
  active?: boolean
  payload?: { payload: UsageTimeseriesPoint }[]
  valueKey: 'requests' | 'totalTokens' | 'estimatedCostUsd'
  format: (v: number) => string
  unit?: string
}

/** Shared recharts tooltip — matches the activity-chart styling convention. */
export function ChartTooltip({ active, payload, valueKey, format, unit }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const v = p[valueKey]
  return (
    <div className="rounded border border-border bg-surface-elevated px-2 py-1 font-mono text-[10px] shadow-lg">
      <span className="text-muted-foreground">{p.label}</span>{' '}
      <span className="text-primary">{format(v)}{unit ? ` ${unit}` : ''}</span>
    </div>
  )
}
