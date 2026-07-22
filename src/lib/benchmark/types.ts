// ───────────────────────────────────────────────────────────────────
// Benchmark Framework — Core Types
// Future-proof contract for model evaluation. New suites implement
// BenchmarkSuite and plug into BenchmarkRunner without touching core code.
// ───────────────────────────────────────────────────────────────────


export type BenchmarkCategory =
  | 'coding'
  | 'reasoning'
  | 'math'
  | 'writing'
  | 'summarization'
  | 'toolCalling'
  | 'longContext'
  | 'instructionFollowing'
  | 'latency'
  | 'costEfficiency'
  | 'reliability'
  | 'jsonStructured'

export type EvaluatorType =
  | 'exact_match'
  | 'contains'
  | 'contains_all'
  | 'json_schema'
  | 'llm_judge'

export interface BenchmarkCase {
  id: string
  name: string
  prompt: string
  system?: string
  /** Optional tools to expose to the model (tool-calling suite).
   *  The runner will cast to the AI SDK's Tool type at execution time. */
  tools?: Record<string, unknown>
  evaluator: EvaluatorType
  /** Expected answer for exact/contains evaluators. */
  expected?: string | string[]
  /** Expected JSON schema / object for json_schema evaluator. */
  expectedSchema?: Record<string, unknown>
  /** Optional weight within a suite (defaults to 1). */
  weight?: number
  /** Timeout in ms for a single case (defaults to 60s). */
  timeoutMs?: number
}

export interface BenchmarkSuite {
  id: string
  name: string
  category: BenchmarkCategory
  /** Weight in overall score calculation (defaults to 1). */
  weight: number
  cases: BenchmarkCase[]
}

export interface CaseResult {
  caseId: string
  passed: boolean
  score: number // 0-100
  latencyMs: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  error?: string
  /** Model's text response (truncated in storage if large). */
  response?: string
  /** Tool calls emitted by the model. */
  toolCalls?: string[]
}

export interface SuiteResult {
  suiteId: string
  category: BenchmarkCategory
  score: number // 0-100
  caseResults: CaseResult[]
  avgLatencyMs: number
  totalCostUsd: number
  successRate: number
}

export interface BenchmarkRun {
  runId: string
  modelId: string
  startedAt: string
  finishedAt: string
  suiteResults: SuiteResult[]
  categoryScores: Record<BenchmarkCategory, number>
  overallScore: number
  metrics: {
    avgLatencyMs: number
    tokensPerSec: number
    avgCostUsd: number
    successRate: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCostUsd: number
  }
}

/** Stored aggregate for a model, ready for UI consumption. */
export interface ModelBenchmark {
  modelId: string
  overall: number
  categories: { category: BenchmarkCategory; score: number }[]
  avgLatencyMs: number
  avgTokensPerSec: number
  avgCostPerMTokens: number
  estimatedCostPerMTokens: number
  contextWindow: number
  successRate: number
  lastBenchmarkedAt: string
  benchmarkCount: number
  provider: string
  runId: string
}

export type BenchmarkSortKey =
  | 'overall'
  | 'fastest'
  | 'cheapest'
  | 'coding'
  | 'reasoning'
  | 'math'
  | 'toolCalling'
  | 'longContext'
  | 'reliability'
  | 'successRate'

export interface BenchmarkStorage {
  saveRun(run: BenchmarkRun): Promise<void>
  getLatestResults(): Promise<ModelBenchmark[]>
  getHistory(modelId: string, limit?: number): Promise<BenchmarkRun[]>
}

export interface ScoreWeights {
  coding: number
  reasoning: number
  math: number
  writing: number
  summarization: number
  toolCalling: number
  longContext: number
  instructionFollowing: number
  latency: number
  costEfficiency: number
  reliability: number
  jsonStructured: number
}
