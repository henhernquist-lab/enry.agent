// ───────────────────────────────────────────────────────────────────
// Model Intelligence — benchmark metrics + health monitoring data layer.
//
// Benchmark result data now lives entirely in Supabase (benchmark_runs),
// read via /api/models/benchmarks → src/lib/benchmark/storage.ts. This
// module only re-exports the shared benchmark types + display metadata and
// the model-health type/helpers; it holds no static performance data.
// ───────────────────────────────────────────────────────────────────

import type {
  BenchmarkCategory as BenchmarkCategoryEngine,
  ModelBenchmark as ModelBenchmarkEngine,
} from './benchmark/types'

// Re-export types from the benchmark engine so the UI and API stay in sync.
export type BenchmarkCategory = BenchmarkCategoryEngine
export type ModelBenchmark = ModelBenchmarkEngine

export interface BenchmarkSortKey {
  id: 'overall' | 'fastest' | 'cheapest' | 'coding' | 'reasoning' | 'math' | 'toolCalling' | 'longContext' | 'reliability' | 'successRate'
  label: string
}

// ── Category metadata (for display) ────────────────────────────────

export const CATEGORY_LABELS: Record<BenchmarkCategory, string> = {
  coding: 'Coding',
  reasoning: 'Reasoning',
  math: 'Math',
  writing: 'Writing',
  summarization: 'Summarization',
  longContext: 'Long Context',
  toolCalling: 'Tool Calling',
  instructionFollowing: 'Instruction Following',
  latency: 'Latency',
  costEfficiency: 'Cost Efficiency',
  reliability: 'Reliability',
  jsonStructured: 'JSON / Structured',
}

export const SORT_OPTIONS: BenchmarkSortKey[] = [
  { id: 'overall', label: 'Best Overall' },
  { id: 'fastest', label: 'Fastest' },
  { id: 'cheapest', label: 'Cheapest' },
  { id: 'coding', label: 'Coding' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'math', label: 'Math' },
  { id: 'toolCalling', label: 'Tool Calling' },
  { id: 'longContext', label: 'Long Context' },
  { id: 'reliability', label: 'Reliability' },
  { id: 'successRate', label: 'Success Rate' },
]


// ── Health snapshots ───────────────────────────────────────────────
// Real per-model health data lives in src/lib/usage/health.ts, aggregated
// from usage_log by /api/models/health. This module only defines the
// shared type + display helpers so the API route and UI agree on shape.

export type HealthStatus = 'online' | 'slow' | 'offline' | 'unknown'

export interface ModelHealth {
  modelId: string
  status: HealthStatus
  /** How `status` was decided — surfaced in the UI so a manual override reads differently from a derived one. */
  statusSource: 'manual' | 'derived' | 'unconfigured' | 'none'
  /** Optional note attached to a manual override (from model_statuses). */
  statusNote: string | null
  /** False when there's no usage_log data at all for this model yet — metrics below are all zero/null, not real. */
  hasData: boolean
  avgLatencyMs: number
  successRate: number // 0-100
  errorRate: number // 0-100
  lastSuccessAt: string | null // ISO timestamp
  lastFailureAt: string | null // ISO timestamp
  requestsToday: number
  provider: string
  latencyHistory: { hour: string; latencyMs: number; hasData: boolean }[]
}

// ── Public API ─────────────────────────────────────────────────────

export function sortBenchmarks(
  benchmarks: ModelBenchmark[],
  sortKey: BenchmarkSortKey['id'],
): ModelBenchmark[] {
  const sorted = [...benchmarks]
  switch (sortKey) {
    case 'overall':
      return sorted.sort((a, b) => b.overall - a.overall)
    case 'fastest':
      return sorted.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs)
    case 'cheapest':
      return sorted.sort((a, b) => a.estimatedCostPerMTokens - b.estimatedCostPerMTokens)
    case 'successRate':
      return sorted.sort((a, b) => b.successRate - a.successRate)
    case 'coding':
    case 'reasoning':
    case 'math':
    case 'toolCalling':
    case 'longContext':
    case 'reliability': {
      const categoryMap: Record<string, BenchmarkCategory> = {
        coding: 'coding',
        reasoning: 'reasoning',
        math: 'math',
        toolCalling: 'toolCalling',
        longContext: 'longContext',
        reliability: 'reliability',
      }
      const cat = categoryMap[sortKey]
      return sorted.sort((a, b) => {
        const aScore = a.categories.find((c) => c.category === cat)?.score ?? 0
        const bScore = b.categories.find((c) => c.category === cat)?.score ?? 0
        return bScore - aScore
      })
    }
    default:
      return sorted
  }
}

// ── Future health recording seam ───────────────────────────────────

export interface HealthSample {
  modelId: string
  latencyMs: number
  success: boolean
  timestamp: string
}

export async function recordHealthSample(_sample: HealthSample): Promise<void> {
  // Future: upsert into a model_health_samples table, recompute rolling
  // averages, and update the health snapshot. Today: no-op — the static
  // snapshots above serve the UI until the poller is built.
}

// ── Utility ────────────────────────────────────────────────────────

export function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatCost(cost: number): string {
  if (cost < 1) return `$${cost.toFixed(2)}`
  return `$${cost.toFixed(2)}`
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
  return `${tokens}`
}

export function healthStatusColor(status: HealthStatus): string {
  switch (status) {
    case 'online': return 'text-primary'
    case 'slow': return 'text-warning'
    case 'offline': return 'text-destructive'
    case 'unknown': return 'text-muted-foreground'
  }
}

export function healthStatusBg(status: HealthStatus): string {
  switch (status) {
    case 'online': return 'bg-primary'
    case 'slow': return 'bg-warning'
    case 'offline': return 'bg-destructive'
    case 'unknown': return 'bg-muted-foreground'
  }
}

export function healthStatusLabel(status: HealthStatus): string {
  switch (status) {
    case 'online': return 'Online'
    case 'slow': return 'Slow'
    case 'offline': return 'Offline'
    case 'unknown': return 'No data'
  }
}
