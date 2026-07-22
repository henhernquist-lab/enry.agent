'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, GitCompare, Loader2, Play, CheckCircle2, AlertCircle } from 'lucide-react'
import { BenchmarkCard } from '@/components/models/benchmark-card'
import { ComparisonTable } from '@/components/models/comparison-table'
import {
  SORT_OPTIONS,
  type BenchmarkSortKey,
  type ModelBenchmark,
} from '@/lib/model-intelligence'
import { MODEL_LIST } from '@/lib/nim'

export default function BenchmarkPage() {
  const [benchmarks, setBenchmarks] = useState<ModelBenchmark[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<BenchmarkSortKey['id']>('overall')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [runModelId, setRunModelId] = useState<string>(MODEL_LIST[0]?.id ?? '')
  const [runState, setRunState] = useState<'idle' | 'starting' | 'started' | 'error'>('idle')
  const [runMessage, setRunMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/models/benchmarks')
      if (res.ok) {
        const data = await res.json()
        setBenchmarks(data.benchmarks ?? [])
      }
    } catch {
      /* keep last-known */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Click-outside for sort dropdown
  useEffect(() => {
    if (!sortMenuOpen) return
    const handler = (e: MouseEvent) => {
      const el = document.getElementById('sort-dropdown')
      if (el && !el.contains(e.target as Node)) setSortMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [sortMenuOpen])

  const sorted = (() => {
    const sorted = [...benchmarks]
    switch (sortKey) {
      case 'overall': return sorted.sort((a, b) => b.overall - a.overall)
      case 'fastest': return sorted.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs)
      case 'cheapest': return sorted.sort((a, b) => a.estimatedCostPerMTokens - b.estimatedCostPerMTokens)
      case 'coding': return sorted.sort((a, b) => (b.categories.find(c => c.category === 'coding')?.score ?? 0) - (a.categories.find(c => c.category === 'coding')?.score ?? 0))
      case 'reasoning': return sorted.sort((a, b) => (b.categories.find(c => c.category === 'reasoning')?.score ?? 0) - (a.categories.find(c => c.category === 'reasoning')?.score ?? 0))
      case 'longContext': return sorted.sort((a, b) => (b.categories.find(c => c.category === 'longContext')?.score ?? 0) - (a.categories.find(c => c.category === 'longContext')?.score ?? 0))
      default: return sorted
    }
  })()

  const toggleSelect = (modelId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(modelId)) next.delete(modelId)
      else next.add(modelId)
      return next
    })
  }

  const selectedBenchmarks = benchmarks.filter((b) => selectedIds.has(b.modelId))
  const currentSort = SORT_OPTIONS.find((s) => s.id === sortKey)

  const handleRunBenchmark = async () => {
    if (!runModelId) return
    setRunState('starting')
    setRunMessage(null)
    try {
      const res = await fetch('/api/models/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: runModelId }),
      })
      if (res.ok) {
        setRunState('started')
        setRunMessage(`Benchmark started for ${runModelId}. Refresh to see updated scores.`)
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }))
        setRunState('error')
        setRunMessage(data.error ?? `Failed to start benchmark`)
      }
    } catch {
      setRunState('error')
      setRunMessage('Network error while starting benchmark')
    }
  }

  return (
    <div>
      {/* Controls bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${benchmarks.length} models`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Selection indicator */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5">
              <GitCompare className="h-3 w-3 text-primary" />
              <span className="font-mono text-[10px] text-primary">{selectedIds.size} selected</span>
            </div>
          )}

          {/* Run benchmark */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated p-1">
            <select
              value={runModelId}
              onChange={(e) => setRunModelId(e.target.value)}
              className="h-7 max-w-[160px] appearance-none border-none bg-transparent pl-2 pr-6 font-mono text-[11px] text-foreground outline-none focus:ring-0"
            >
              {MODEL_LIST.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleRunBenchmark}
              disabled={runState === 'starting'}
              className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 font-mono text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {runState === 'starting' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Run
            </button>
          </div>

          {/* Sort dropdown */}
          <div id="sort-dropdown" className="relative">
            <button
              onClick={() => setSortMenuOpen((o) => !o)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <span className="text-muted-foreground/60">Sort:</span>
              <span className="text-foreground">{currentSort?.label}</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${sortMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {sortMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-44 border border-border bg-surface-secondary shadow-xl">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => { setSortKey(opt.id); setSortMenuOpen(false) }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[11px] transition-colors hover:bg-surface-elevated ${
                      sortKey === opt.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${sortKey === opt.id ? 'bg-primary' : 'border border-border'}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comparison table (shows when 2+ selected) */}
      {selectedBenchmarks.length >= 2 && (
        <div className="mb-6">
          <ComparisonTable
            benchmarks={selectedBenchmarks}
            onRemove={(id) => toggleSelect(id)}
          />
        </div>
      )}

      {/* Cards grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((benchmark, index) => (
            <BenchmarkCard
              key={benchmark.modelId}
              benchmark={benchmark}
              index={index}
              selected={selectedIds.has(benchmark.modelId)}
              onToggleSelect={() => toggleSelect(benchmark.modelId)}
            />
          ))}
        </div>
      )}

      {/* Hint */}
      {/* Run status */}
      {runMessage && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px] ${
            runState === 'error'
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'border-primary/30 bg-primary/5 text-primary'
          }`}
        >
          {runState === 'error' ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          <span>{runMessage}</span>
        </div>
      )}

      {!loading && benchmarks.length > 0 && (
        <p className="mt-6 font-mono text-[10px] text-muted-foreground/50">
          Click any card to select it for side-by-side comparison. Select 2 or more to see the comparison table.
        </p>
      )}
    </div>
  )
}
