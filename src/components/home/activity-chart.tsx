'use client'

import { useEffect, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Activity, TrendingUp, Wrench, Flame } from 'lucide-react'
import { onResourceSaved } from '@/lib/resource-events'

interface ActivityData {
  daily: { day: string; count: number }[]
  savedThisWeek: number
  mostActiveTool: string | null
  streak: number
  hasEnoughData: boolean
}

function fmtTick(day: string): string {
  const [, m, d] = day.split('-')
  return `${Number(m)}/${Number(d)}`
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { day: string; count: number } }[] }) {
  if (!active || !payload?.length) return null
  const { day, count } = payload[0].payload
  return (
    <div className="rounded border border-border bg-surface-elevated px-2 py-1 font-mono text-[10px] shadow-lg">
      <span className="text-muted-foreground">{fmtTick(day)}</span>{' '}
      <span className="text-primary">{count} saved</span>
    </div>
  )
}

export function ActivityChart() {
  const [data, setData] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const tzOffset = new Date().getTimezoneOffset()
        const res = await fetch(`/api/system/activity?tzOffset=${tzOffset}`)
        if (res.ok) setData(await res.json())
      } catch {
        /* keep last-known on transient failure */
      } finally {
        setLoading(false)
      }
    }
    load()
    return onResourceSaved(load)
  }, [])

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-primary" />
        <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </h3>
      </div>

      {loading ? (
        <div className="h-[100px] animate-pulse rounded border border-border bg-surface-elevated/40" />
      ) : !data || !data.hasEnoughData ? (
        <div className="flex h-[100px] flex-col items-center justify-center gap-2 rounded border border-dashed border-border bg-surface-elevated/20 px-3 text-center">
          {/* faint placeholder shape */}
          <svg viewBox="0 0 120 32" className="h-6 w-24 text-border" preserveAspectRatio="none">
            <path d="M0 26 L20 20 L40 24 L60 12 L80 18 L100 8 L120 14" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <p className="font-mono text-[10px] text-muted-foreground">
            Activity will show up here as you use enry
          </p>
        </div>
      ) : (
        <>
          <div className="h-[100px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tickFormatter={fmtTick}
                  interval={6}
                  tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--color-muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-primary)"
                  strokeWidth={1.5}
                  fill="url(#activityFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 text-accent" />
              <span className="font-mono text-[10px] text-muted-foreground">
                <span className="text-foreground">{data.savedThisWeek}</span> saved this week
              </span>
            </div>
            {data.mostActiveTool && (
              <div className="flex items-center gap-2">
                <Wrench className="h-3 w-3 text-accent" />
                <span className="font-mono text-[10px] text-muted-foreground">
                  most active: <span className="text-foreground">{data.mostActiveTool}</span>
                </span>
              </div>
            )}
            {data.streak > 0 && (
              <div className="flex items-center gap-2">
                <Flame className="h-3 w-3 text-warning" />
                <span className="font-mono text-[10px] text-muted-foreground">
                  <span className="text-warning">{data.streak}</span> day streak
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
