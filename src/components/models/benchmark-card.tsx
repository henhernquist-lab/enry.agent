'use client'

import { motion } from 'framer-motion'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'
import { Clock, DollarSign, FileText, CheckCircle2, Zap } from 'lucide-react'
import {
  CATEGORY_LABELS,
  formatLatency,
  formatCost,
  formatContextWindow,
  type ModelBenchmark,
} from '@/lib/model-intelligence'
import { getModelMeta } from '@/lib/nim'

interface BenchmarkCardProps {
  benchmark: ModelBenchmark
  index: number
  selected: boolean
  onToggleSelect: () => void
}

export function BenchmarkCard({ benchmark, index, selected, onToggleSelect }: BenchmarkCardProps) {
  const meta = getModelMeta(benchmark.modelId)
  const radarData = benchmark.categories.map((c) => ({
    category: CATEGORY_LABELS[c.category],
    score: c.score,
  }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.06, 0.4) }}
      whileHover={{ y: -2 }}
      onClick={onToggleSelect}
      className={`cursor-pointer rounded-xl border p-5 transition-all duration-200 ${
        selected
          ? 'border-primary/40 bg-primary/5 shadow-[0_0_20px_rgba(58,158,96,0.08)]'
          : 'border-border bg-surface-secondary hover:border-primary/20 hover:bg-surface-elevated'
      }`}
    >
      {/* Header: model name + overall score */}
      <div className="mb-4 flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-semibold text-foreground">{meta?.label ?? benchmark.modelId}</p>
            {selected && (
              <span className="flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                selected
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{meta?.company}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="font-display text-2xl font-bold text-primary">{benchmark.overall}</p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">overall</p>
        </div>
      </div>

      {/* Radar chart */}
      <div className="mb-4 h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <PolarGrid stroke="var(--color-border)" strokeWidth={0.5} />
            <PolarAngleAxis
              dataKey="category"
              tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--color-muted-foreground)' }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              dataKey="score"
              stroke="var(--color-primary)"
              strokeWidth={1.5}
              fill="var(--color-primary)"
              fillOpacity={0.15}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Category scores — compact grid */}
      <div className="mb-4 grid grid-cols-3 gap-1.5">
        {benchmark.categories.map((c) => (
          <div key={c.category} className="rounded border border-border bg-surface-elevated/50 px-2 py-1.5">
            <p className="font-mono text-[8px] uppercase tracking-wide text-muted-foreground">{CATEGORY_LABELS[c.category]}</p>
            <p className={`font-mono text-sm font-semibold ${c.score >= 85 ? 'text-primary' : c.score >= 70 ? 'text-foreground' : 'text-muted-foreground'}`}>
              {c.score}
            </p>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-3">
        <Stat icon={Clock} label="Latency" value={formatLatency(benchmark.avgLatencyMs)} />
        <Stat icon={DollarSign} label="Cost/M" value={formatCost(benchmark.estimatedCostPerMTokens)} />
        <Stat icon={FileText} label="Context" value={formatContextWindow(benchmark.contextWindow)} />
        <Stat icon={CheckCircle2} label="Success" value={`${benchmark.successRate}%`} />
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-2">
        <Zap className="h-2.5 w-2.5 text-muted-foreground/50" />
        <p className="font-mono text-[9px] text-muted-foreground/60">
          benchmarked {new Date(benchmark.lastBenchmarkedAt).toLocaleDateString()}
        </p>
      </div>
    </motion.div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono text-[10px] font-medium text-foreground">{value}</span>
    </div>
  )
}
