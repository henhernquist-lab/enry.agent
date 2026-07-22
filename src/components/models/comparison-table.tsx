'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, DollarSign, FileText, CheckCircle2 } from 'lucide-react'
import {
  CATEGORY_LABELS,
  formatLatency,
  formatCost,
  formatContextWindow,
  type ModelBenchmark,
  type BenchmarkCategory,
} from '@/lib/model-intelligence'
import { getModelMeta } from '@/lib/nim'

interface ComparisonTableProps {
  benchmarks: ModelBenchmark[]
  onRemove: (modelId: string) => void
}

export function ComparisonTable({ benchmarks, onRemove }: ComparisonTableProps) {
  if (benchmarks.length < 2) return null

  const categories = Object.keys(CATEGORY_LABELS) as BenchmarkCategory[]
  const stats = [
    { key: 'avgLatencyMs', label: 'Latency', icon: Clock, format: (v: number) => formatLatency(v) },
    { key: 'estimatedCostPerMTokens', label: 'Cost/M tokens', icon: DollarSign, format: (v: number) => formatCost(v) },
    { key: 'contextWindow', label: 'Context window', icon: FileText, format: (v: number) => formatContextWindow(v) },
    { key: 'successRate', label: 'Success rate', icon: CheckCircle2, format: (v: number) => `${v}%` },
  ] as const

  // Find best value per row for highlighting
  const getBest = (values: number[], lowerIsBetter: boolean) => {
    const best = lowerIsBetter ? Math.min(...values) : Math.max(...values)
    return benchmarks.findIndex((b, i) => values[i] === best)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="rounded-xl border border-primary/20 bg-surface-secondary p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-primary">Comparison</span>
            <span className="font-mono text-[10px] text-muted-foreground">{benchmarks.length} models</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            {/* Header row: model names */}
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 z-10 bg-surface-secondary px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Metric
                </th>
                {benchmarks.map((b) => {
                  const meta = getModelMeta(b.modelId)
                  return (
                    <th key={b.modelId} className="px-3 py-2 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-foreground">{meta?.label ?? b.modelId}</span>
                        <button
                          onClick={() => onRemove(b.modelId)}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="font-mono text-[9px] text-muted-foreground/60">{meta?.company}</p>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {/* Overall */}
              <tr className="border-b border-border/50">
                <td className="sticky left-0 z-10 bg-surface-secondary px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Overall
                </td>
                {(() => {
                  const values = benchmarks.map((b) => b.overall)
                  const bestIdx = getBest(values, false)
                  return benchmarks.map((b, i) => (
                    <td key={b.modelId} className="px-3 py-2">
                      <span className={`font-mono text-sm font-bold ${i === bestIdx ? 'text-primary' : 'text-foreground'}`}>
                        {b.overall}
                      </span>
                    </td>
                  ))
                })()}
              </tr>

              {/* Category scores */}
              {categories.map((cat) => (
                <tr key={cat} className="border-b border-border/30">
                  <td className="sticky left-0 z-10 bg-surface-secondary px-3 py-2 font-mono text-[10px] text-muted-foreground">
                    {CATEGORY_LABELS[cat]}
                  </td>
                  {(() => {
                    const values = benchmarks.map((b) => b.categories.find((c) => c.category === cat)?.score ?? 0)
                    const bestIdx = getBest(values, false)
                    return benchmarks.map((b, i) => {
                      const score = values[i]
                      return (
                        <td key={b.modelId} className="px-3 py-2">
                          <span className={`font-mono text-xs ${i === bestIdx ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                            {score}
                          </span>
                          {i === bestIdx && <span className="ml-1 text-primary text-[8px]">●</span>}
                        </td>
                      )
                    })
                  })()}
                </tr>
              ))}

              {/* Stats */}
              {stats.map((stat) => (
                <tr key={stat.key} className="border-b border-border/30">
                  <td className="sticky left-0 z-10 bg-surface-secondary px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <stat.icon className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono text-[10px] text-muted-foreground">{stat.label}</span>
                    </div>
                  </td>
                  {(() => {
                    const values = benchmarks.map((b) => b[stat.key] as number)
                    const lowerIsBetter = stat.key === 'avgLatencyMs' || stat.key === 'estimatedCostPerMTokens'
                    const bestIdx = getBest(values, lowerIsBetter)
                    return benchmarks.map((b, i) => (
                      <td key={b.modelId} className="px-3 py-2">
                        <span className={`font-mono text-xs ${i === bestIdx ? 'font-semibold text-primary' : 'text-foreground'}`}>
                          {stat.format(values[i])}
                        </span>
                      </td>
                    ))
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 font-mono text-[9px] text-muted-foreground/60">
          <span className="text-primary">●</span> = best in row · lower is better for latency & cost
        </p>
      </motion.div>
    </AnimatePresence>
  )
}
