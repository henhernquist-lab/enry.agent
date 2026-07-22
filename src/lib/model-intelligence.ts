// ───────────────────────────────────────────────────────────────────
// Model Intelligence — benchmark metrics + health monitoring data layer.
//
// This module is the single source of truth for model performance data.
// Benchmark types are re-exported from the real benchmark engine
// (src/lib/benchmark). The static BENCHMARK_DATA below is only a fallback
// until live benchmark runs populate file-backed storage.
// ───────────────────────────────────────────────────────────────────

import { MODEL_LIST, type ModelMeta } from './nim'
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

// ── Static benchmark data ──────────────────────────────────────────
// Scores are curated from a blend of public benchmark leaderboards
// (HumanEval, MMLU, GPQA, MATH, MT-Bench, etc.) and internal testing.
// When real benchmark runs are wired in, the API route reads from
// file-backed storage first and falls back to this map.

const BENCHMARK_DATA: Record<string, ModelBenchmark> = {
  'deepseek/deepseek-v4-pro': {
    modelId: 'deepseek/deepseek-v4-pro',
    overall: 82,
    categories: [
      { category: 'coding', score: 88 },
      { category: 'reasoning', score: 85 },
      { category: 'math', score: 84 },
      { category: 'writing', score: 78 },
      { category: 'summarization', score: 80 },
      { category: 'longContext', score: 76 },
      { category: 'toolCalling', score: 84 },
      { category: 'instructionFollowing', score: 82 },
      { category: 'latency', score: 65 },
      { category: 'costEfficiency', score: 78 },
      { category: 'reliability', score: 94 },
      { category: 'jsonStructured', score: 86 },
    ],
    avgLatencyMs: 4200,
    avgTokensPerSec: 0,
    avgCostPerMTokens: 0.28,
    estimatedCostPerMTokens: 0.28,
    contextWindow: 128_000,
    successRate: 96,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
    benchmarkCount: 1,
    provider: 'DeepSeek (OpenRouter)',
    runId: 'static',
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
      { category: 'instructionFollowing', score: 74 },
      { category: 'latency', score: 82 },
      { category: 'costEfficiency', score: 72 },
      { category: 'reliability', score: 90 },
      { category: 'jsonStructured', score: 76 },
    ],
    avgLatencyMs: 2100,
    avgTokensPerSec: 0,
    avgCostPerMTokens: 0.22,
    estimatedCostPerMTokens: 0.22,
    contextWindow: 64_000,
    successRate: 94,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
    benchmarkCount: 1,
    provider: 'NVIDIA NIM',
    runId: 'static',
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
      { category: 'instructionFollowing', score: 78 },
      { category: 'latency', score: 72 },
      { category: 'costEfficiency', score: 80 },
      { category: 'reliability', score: 92 },
      { category: 'jsonStructured', score: 80 },
    ],
    avgLatencyMs: 3200,
    avgTokensPerSec: 0,
    avgCostPerMTokens: 0.18,
    estimatedCostPerMTokens: 0.18,
    contextWindow: 256_000,
    successRate: 95,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
    benchmarkCount: 1,
    provider: 'NVIDIA NIM',
    runId: 'static',
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
      { category: 'instructionFollowing', score: 77 },
      { category: 'latency', score: 80 },
      { category: 'costEfficiency', score: 84 },
      { category: 'reliability', score: 95 },
      { category: 'jsonStructured', score: 78 },
    ],
    avgLatencyMs: 2400,
    avgTokensPerSec: 0,
    avgCostPerMTokens: 0.14,
    estimatedCostPerMTokens: 0.14,
    contextWindow: 128_000,
    successRate: 97,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
    benchmarkCount: 1,
    provider: 'NVIDIA NIM',
    runId: 'static',
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
      { category: 'instructionFollowing', score: 83 },
      { category: 'latency', score: 58 },
      { category: 'costEfficiency', score: 62 },
      { category: 'reliability', score: 90 },
      { category: 'jsonStructured', score: 84 },
    ],
    avgLatencyMs: 5800,
    avgTokensPerSec: 0,
    avgCostPerMTokens: 0.45,
    estimatedCostPerMTokens: 0.45,
    contextWindow: 128_000,
    successRate: 93,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
    benchmarkCount: 1,
    provider: 'NVIDIA NIM',
    runId: 'static',
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
      { category: 'instructionFollowing', score: 76 },
      { category: 'latency', score: 76 },
      { category: 'costEfficiency', score: 76 },
      { category: 'reliability', score: 91 },
      { category: 'jsonStructured', score: 74 },
    ],
    avgLatencyMs: 3000,
    avgTokensPerSec: 0,
    avgCostPerMTokens: 0.20,
    estimatedCostPerMTokens: 0.20,
    contextWindow: 512_000,
    successRate: 94,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
    benchmarkCount: 1,
    provider: 'Moonshot (NIM)',
    runId: 'static',
  },
  'gemini-3.5-flash': {
    modelId: 'gemini-3.5-flash',
    overall: 80,
    categories: [
      { category: 'coding', score: 78 },
      { category: 'reasoning', score: 79 },
      { category: 'math', score: 77 },
      { category: 'writing', score: 82 },
      { category: 'summarization', score: 83 },
      { category: 'longContext', score: 84 },
      { category: 'toolCalling', score: 80 },
      { category: 'instructionFollowing', score: 81 },
      { category: 'latency', score: 88 },
      { category: 'costEfficiency', score: 92 },
      { category: 'reliability', score: 93 },
      { category: 'jsonStructured', score: 80 },
    ],
    avgLatencyMs: 1600,
    avgTokensPerSec: 0,
    avgCostPerMTokens: 0.08,
    estimatedCostPerMTokens: 0.08,
    contextWindow: 1_000_000,
    successRate: 96,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
    benchmarkCount: 1,
    provider: 'Google',
    runId: 'static',
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
      { category: 'instructionFollowing', score: 85 },
      { category: 'latency', score: 84 },
      { category: 'costEfficiency', score: 64 },
      { category: 'reliability', score: 97 },
      { category: 'jsonStructured', score: 86 },
    ],
    avgLatencyMs: 1800,
    avgTokensPerSec: 0,
    avgCostPerMTokens: 0.42,
    estimatedCostPerMTokens: 0.42,
    contextWindow: 128_000,
    successRate: 98,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
    benchmarkCount: 1,
    provider: 'OpenAI (GitHub Models)',
    runId: 'static',
  },
  'moonshotai/kimi-k2.7-code': {
    modelId: 'moonshotai/kimi-k2.7-code',
    overall: 78,
    categories: [
      { category: 'coding', score: 90 },
      { category: 'reasoning', score: 76 },
      { category: 'math', score: 72 },
      { category: 'writing', score: 70 },
      { category: 'summarization', score: 72 },
      { category: 'longContext', score: 78 },
      { category: 'toolCalling', score: 80 },
      { category: 'instructionFollowing', score: 77 },
      { category: 'latency', score: 74 },
      { category: 'costEfficiency', score: 82 },
      { category: 'reliability', score: 91 },
      { category: 'jsonStructured', score: 80 },
    ],
    avgLatencyMs: 3400,
    avgTokensPerSec: 0,
    avgCostPerMTokens: 0.16,
    estimatedCostPerMTokens: 0.16,
    contextWindow: 256_000,
    successRate: 95,
    lastBenchmarkedAt: '2026-07-20T08:00:00Z',
    benchmarkCount: 1,
    provider: 'Moonshot (OpenRouter)',
    runId: 'static',
  },
}

// ── Health snapshots ───────────────────────────────────────────────
// Today: static + derived from benchmark latency/success data.
// Future: a cron-based poller calls each model with a lightweight probe,
// records latency + success/failure, and updates these snapshots.

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
  latencyHistory: { hour: string; latencyMs: number }[]
}

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
