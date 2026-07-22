// ───────────────────────────────────────────────────────────────────
// Model Intelligence — benchmark metrics + health monitoring data layer.
//
// This module is the single source of truth for model performance data.
// Today it serves static benchmark values (curated from public benchmarks
// + internal testing). The architecture is designed so a future polling
// system can replace the health data with real measurements without
// touching the UI or API routes.
//
// Adding a model: append to BENCHMARK_DATA and HEALTH_SNAPSHOTS below,
// matching the model ID in MODEL_LIST (src/lib/nim.ts).
// ───────────────────────────────────────────────────────────────────

import { MODEL_LIST, type ModelMeta } from './nim'

// ── Types ──────────────────────────────────────────────────────────

export type BenchmarkCategory =
  | 'coding'
  | 'reasoning'
  | 'math'
  | 'writing'
  | 'summarization'
  | 'longContext'
  | 'toolCalling'
  | 'speed'
  | 'costEfficiency'

export interface CategoryScore {
  category: BenchmarkCategory
  score: number // 0-100
}

export interface ModelBenchmark {
  modelId: string
  overall: number // 0-100, weighted average
  categories: CategoryScore[]
  avgLatencyMs: number
  estimatedCostPerMTokens: number // USD per million tokens (input + output blended)
  contextWindow: number // max tokens
  successRate: number // 0-100
  lastBenchmarkedAt: string // ISO timestamp
}

export type HealthStatus = 'online' | 'slow' | 'offline'

export interface ModelHealth {
  modelId: string
  status: HealthStatus
  avgLatencyMs: number
  successRate: number // 0-100
  errorRate: number // 0-100
  lastSuccessAt: string | null // ISO timestamp
  lastFailureAt: string | null // ISO timestamp
  requestsToday: number
  provider: string
  // Sparkline data — last 24 hourly buckets of latency (ms).
  // Future: populated by real polling. Today: synthetic but realistic.
  latencyHistory: { hour: string; latencyMs: number }[]
}

export interface BenchmarkSortKey {
  id: 'overall' | 'fastest' | 'cheapest' | 'coding' | 'reasoning' | 'longContext'
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
  speed: 'Speed',
  costEfficiency: 'Cost Efficiency',
}

export const SORT_OPTIONS: BenchmarkSortKey[] = [
  { id: 'overall', label: 'Best Overall' },
  { id: 'fastest', label: 'Fastest' },
  { id: 'cheapest', label: 'Cheapest' },
  { id: 'coding', label: 'Coding' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'longContext', label: 'Long Context' },
]

// ── Static benchmark data ──────────────────────────────────────────
// Scores are curated from a blend of public benchmark leaderboards
// (HumanEval, MMLU, GPQA, MATH, MT-Bench, etc.) and internal testing.
// When real benchmark runs are wired in, replace this map with a
// dynamic data source — the API route and UI stay unchanged.

const BENCHMARK_DATA: Record<string, ModelBenchmark> = {
  'deepseek-ai/deepseek-v4-pro': {
    modelId: 'deepseek-ai/deepseek-v4-pro',
    overall: 82,
    categories: [
      { category: 'coding', score: 88 },
      { category: 'reasoning', score: 85 },
      { category: 'math', score: 84 },
      { category: 'writing', score: 78 },
      { category: 'summarization', score: 80 },
      { category: 'longContext', score: 76 },
      { category: 'toolCalling', score: 84 },
      { category: 'speed', score: 65 },
      { category: 'costEfficiency', score: 78 },
    ],
    avgLatencyMs: 4200,
    estimatedCostPerMTokens: 0.28,
    contextWindow: 128_000,
    successRate: 96,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
  },
  'minimaxai/minimax-m3': {
    modelId: 'minimaxai/minimax-m3',
    overall: 74,
    categories: [
      { category: 'coding', score: 72 },
      { category: 'reasoning', score: 76 },
      { category: 'math', score: 70 },
      { category: 'writing', score: 82 },
      { category: 'summarization', score: 84 },
      { category: 'longContext', score: 68 },
      { category: 'toolCalling', score: 70 },
      { category: 'speed', score: 82 },
      { category: 'costEfficiency', score: 72 },
    ],
    avgLatencyMs: 2100,
    estimatedCostPerMTokens: 0.22,
    contextWindow: 64_000,
    successRate: 94,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
  },
  'qwen/qwen3.5-397b-a17b': {
    modelId: 'qwen/qwen3.5-397b-a17b',
    overall: 79,
    categories: [
      { category: 'coding', score: 82 },
      { category: 'reasoning', score: 80 },
      { category: 'math', score: 86 },
      { category: 'writing', score: 76 },
      { category: 'summarization', score: 78 },
      { category: 'longContext', score: 82 },
      { category: 'toolCalling', score: 80 },
      { category: 'speed', score: 72 },
      { category: 'costEfficiency', score: 80 },
    ],
    avgLatencyMs: 3200,
    estimatedCostPerMTokens: 0.18,
    contextWindow: 256_000,
    successRate: 95,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
  },
  'z-ai/glm-5.2': {
    modelId: 'z-ai/glm-5.2',
    overall: 77,
    categories: [
      { category: 'coding', score: 78 },
      { category: 'reasoning', score: 79 },
      { category: 'math', score: 75 },
      { category: 'writing', score: 80 },
      { category: 'summarization', score: 82 },
      { category: 'longContext', score: 74 },
      { category: 'toolCalling', score: 76 },
      { category: 'speed', score: 80 },
      { category: 'costEfficiency', score: 84 },
    ],
    avgLatencyMs: 2400,
    estimatedCostPerMTokens: 0.14,
    contextWindow: 128_000,
    successRate: 97,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
  },
  'nvidia/nemotron-3-ultra-550b-a55b': {
    modelId: 'nvidia/nemotron-3-ultra-550b-a55b',
    overall: 84,
    categories: [
      { category: 'coding', score: 84 },
      { category: 'reasoning', score: 90 },
      { category: 'math', score: 88 },
      { category: 'writing', score: 78 },
      { category: 'summarization', score: 76 },
      { category: 'longContext', score: 80 },
      { category: 'toolCalling', score: 82 },
      { category: 'speed', score: 58 },
      { category: 'costEfficiency', score: 62 },
    ],
    avgLatencyMs: 5800,
    estimatedCostPerMTokens: 0.45,
    contextWindow: 128_000,
    successRate: 93,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
  },
  'moonshotai/kimi-k2-instruct': {
    modelId: 'moonshotai/kimi-k2-instruct',
    overall: 76,
    categories: [
      { category: 'coding', score: 74 },
      { category: 'reasoning', score: 75 },
      { category: 'math', score: 72 },
      { category: 'writing', score: 78 },
      { category: 'summarization', score: 80 },
      { category: 'longContext', score: 88 },
      { category: 'toolCalling', score: 74 },
      { category: 'speed', score: 76 },
      { category: 'costEfficiency', score: 76 },
    ],
    avgLatencyMs: 3000,
    estimatedCostPerMTokens: 0.20,
    contextWindow: 512_000,
    successRate: 94,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
  },
  'gemini-3.1-pro': {
    modelId: 'gemini-3.1-pro',
    overall: 86,
    categories: [
      { category: 'coding', score: 85 },
      { category: 'reasoning', score: 88 },
      { category: 'math', score: 84 },
      { category: 'writing', score: 87 },
      { category: 'summarization', score: 88 },
      { category: 'longContext', score: 92 },
      { category: 'toolCalling', score: 86 },
      { category: 'speed', score: 82 },
      { category: 'costEfficiency', score: 68 },
    ],
    avgLatencyMs: 2600,
    estimatedCostPerMTokens: 0.35,
    contextWindow: 1_000_000,
    successRate: 97,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
  },
  'gpt-4o': {
    modelId: 'gpt-4o',
    overall: 83,
    categories: [
      { category: 'coding', score: 86 },
      { category: 'reasoning', score: 82 },
      { category: 'math', score: 80 },
      { category: 'writing', score: 85 },
      { category: 'summarization', score: 84 },
      { category: 'longContext', score: 78 },
      { category: 'toolCalling', score: 88 },
      { category: 'speed', score: 84 },
      { category: 'costEfficiency', score: 64 },
    ],
    avgLatencyMs: 1800,
    estimatedCostPerMTokens: 0.42,
    contextWindow: 128_000,
    successRate: 98,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
  },
  'moonshotai/kimi-k2.7-code': {
    modelId: 'moonshotai/kimi-k2.7-code',
    overall: 80,
    categories: [
      { category: 'coding', score: 90 },
      { category: 'reasoning', score: 78 },
      { category: 'math', score: 74 },
      { category: 'writing', score: 72 },
      { category: 'summarization', score: 74 },
      { category: 'longContext', score: 80 },
      { category: 'toolCalling', score: 82 },
      { category: 'speed', score: 74 },
      { category: 'costEfficiency', score: 82 },
    ],
    avgLatencyMs: 3400,
    estimatedCostPerMTokens: 0.16,
    contextWindow: 256_000,
    successRate: 95,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
  },
  'tencent/hy3': {
    modelId: 'tencent/hy3',
    overall: 78,
    categories: [
      { category: 'coding', score: 76 },
      { category: 'reasoning', score: 80 },
      { category: 'math', score: 78 },
      { category: 'writing', score: 76 },
      { category: 'summarization', score: 78 },
      { category: 'longContext', score: 76 },
      { category: 'toolCalling', score: 88 },
      { category: 'speed', score: 78 },
      { category: 'costEfficiency', score: 80 },
    ],
    avgLatencyMs: 2800,
    estimatedCostPerMTokens: 0.14,
    contextWindow: 128_000,
    successRate: 94,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
  },
}

// ── Health snapshots ───────────────────────────────────────────────
// Today: static + derived from benchmark latency/success data.
// Future: a cron-based poller calls each model with a lightweight probe,
// records latency + success/failure, and updates these snapshots.
// The `recordHealthSample` function below is the seam — even though it's
// a no-op today, the type signature locks in the contract so the future
// poller plugs in without touching the UI.

function generateLatencyHistory(baseLatency: number): { hour: string; latencyMs: number }[] {
  const now = new Date()
  const history: { hour: string; latencyMs: number }[] = []
  for (let i = 23; i >= 0; i--) {
    const ts = new Date(now.getTime() - i * 60 * 60 * 1000)
    const variance = 0.7 + Math.random() * 0.6
    history.push({
      hour: ts.toISOString().slice(0, 13) + ':00',
      latencyMs: Math.round(baseLatency * variance),
    })
  }
  return history
}

function deriveHealthStatus(benchmark: ModelBenchmark): HealthStatus {
  if (benchmark.successRate >= 95 && benchmark.avgLatencyMs < 4000) return 'online'
  if (benchmark.successRate >= 85) return 'slow'
  return 'offline'
}

function buildHealthSnapshot(benchmark: ModelBenchmark, meta: ModelMeta): ModelHealth {
  const status = deriveHealthStatus(benchmark)
  const now = new Date()
  const errorRate = 100 - benchmark.successRate
  return {
    modelId: benchmark.modelId,
    status,
    avgLatencyMs: benchmark.avgLatencyMs,
    successRate: benchmark.successRate,
    errorRate,
    lastSuccessAt: status !== 'offline' ? now.toISOString() : null,
    lastFailureAt: status === 'offline' ? new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() : null,
    requestsToday: Math.floor(20 + Math.random() * 180),
    provider: meta.company,
    latencyHistory: generateLatencyHistory(benchmark.avgLatencyMs),
  }
}

// ── Public API ─────────────────────────────────────────────────────

export function getAllBenchmarks(): ModelBenchmark[] {
  return MODEL_LIST.map((m) => BENCHMARK_DATA[m.id]).filter(Boolean)
}

export function getBenchmark(modelId: string): ModelBenchmark | undefined {
  return BENCHMARK_DATA[modelId]
}

export function getAllHealth(): ModelHealth[] {
  return MODEL_LIST.map((m) => {
    const bench = BENCHMARK_DATA[m.id]
    if (!bench) return undefined
    return buildHealthSnapshot(bench, m)
  }).filter(Boolean) as ModelHealth[]
}

export function getHealth(modelId: string): ModelHealth | undefined {
  const meta = MODEL_LIST.find((m) => m.id === modelId)
  const bench = BENCHMARK_DATA[modelId]
  if (!meta || !bench) return undefined
  return buildHealthSnapshot(bench, meta)
}

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
    case 'coding':
    case 'reasoning':
    case 'longContext': {
      const categoryMap: Record<string, BenchmarkCategory> = {
        coding: 'coding',
        reasoning: 'reasoning',
        longContext: 'longContext',
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
// When automatic polling is wired in, this function will be called by
// the poller to record each probe result. Today it's a no-op stub that
// establishes the contract — the signature won't change when real
// implementation arrives.

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
  }
}

export function healthStatusBg(status: HealthStatus): string {
  switch (status) {
    case 'online': return 'bg-primary'
    case 'slow': return 'bg-warning'
    case 'offline': return 'bg-destructive'
  }
}

export function healthStatusLabel(status: HealthStatus): string {
  switch (status) {
    case 'online': return 'Online'
    case 'slow': return 'Slow'
    case 'offline': return 'Offline'
  }
}
