import { supabase } from '@/lib/supabase'
import type { BenchmarkRun, ModelBenchmark, BenchmarkCategory } from './types'
import { MODEL_LIST } from '@/lib/nim'

// ───────────────────────────────────────────────────────────────────
// Real benchmark storage, backed by the benchmark_runs Supabase table
// (migration 20260723140000). Replaces the old filesystem storage, which
// wrote JSON under process.cwd()/.data and did not persist on Vercel
// serverless at all.
//
// One row per run. "Latest per model" is just the newest completed row
// for each model_id, deduped at read time — no separate rollup table.
// Service-role client bypasses RLS; ownership is enforced via user_id in
// every query, same posture as the rest of the app.
// ───────────────────────────────────────────────────────────────────

interface BenchmarkRunRow {
  id: string
  user_id: string
  model_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: RunProgress | Record<string, never>
  heartbeat_at: string | null
  overall_score: number | null
  category_scores: Record<BenchmarkCategory, number> | null
  metrics: BenchmarkRun['metrics'] | null
  suite_results: BenchmarkRun['suiteResults'] | null
  error: string | null
  started_at: string
  finished_at: string | null
  created_at: string
}

export interface RunProgress {
  suite: string
  caseId: string
  completed: number
  total: number
}

export interface RunStatus {
  runId: string
  modelId: string
  status: BenchmarkRunRow['status']
  progress: RunProgress | null
  heartbeatAt: string | null
  finishedAt: string | null
  error: string | null
}

function contextWindowFor(modelId: string): number {
  // Conservative defaults aligned with known registry specs.
  if (modelId.includes('kimi-k2.7-code')) return 256_000
  if (modelId.includes('kimi-k2')) return 512_000
  if (modelId.includes('gemini')) return 1_000_000
  if (modelId.includes('qwen')) return 256_000
  if (modelId.includes('glm')) return 128_000
  if (modelId.includes('nemotron')) return 128_000
  if (modelId.includes('deepseek')) return 128_000
  if (modelId.includes('minimax')) return 64_000
  if (modelId.includes('gpt-4o')) return 128_000
  if (modelId.includes('grok')) return 131_072
  return 128_000
}

function providerFor(modelId: string): string {
  const meta = MODEL_LIST.find((m) => m.id === modelId)
  return meta?.company ?? modelId.split('/')[0] ?? 'unknown'
}

// Reconstruct the UI-facing aggregate from a completed run row. Mirrors the
// ModelBenchmark shape the Benchmark tab expects; runId carries the DB row id.
function rowToModelBenchmark(row: BenchmarkRunRow): ModelBenchmark {
  const metrics = row.metrics
  const totalTokens = (metrics?.totalInputTokens ?? 0) + (metrics?.totalOutputTokens ?? 0)
  const avgCostPerM = metrics && totalTokens > 0 ? (metrics.totalCostUsd / totalTokens) * 1_000_000 : 0
  const categoryScores = row.category_scores ?? ({} as Record<BenchmarkCategory, number>)
  return {
    modelId: row.model_id,
    overall: row.overall_score ?? 0,
    categories: Object.entries(categoryScores).map(([category, score]) => ({
      category: category as BenchmarkCategory,
      score,
    })),
    avgLatencyMs: metrics?.avgLatencyMs ?? 0,
    avgTokensPerSec: metrics?.tokensPerSec ?? 0,
    avgCostPerMTokens: avgCostPerM,
    estimatedCostPerMTokens: avgCostPerM,
    contextWindow: contextWindowFor(row.model_id),
    successRate: metrics?.successRate ?? 0,
    lastBenchmarkedAt: row.finished_at ?? row.created_at,
    benchmarkCount: 1,
    provider: providerFor(row.model_id),
    runId: row.id,
  }
}

/** Inserts a fresh run row (status 'running') and returns its id — the handle
 *  the client polls and the run continuation writes results back to. */
export async function startBenchmarkRun(userId: string, modelId: string): Promise<string> {
  const { data, error } = await supabase
    .from('benchmark_runs')
    .insert({
      user_id: userId,
      model_id: modelId,
      status: 'running',
      progress: {},
      heartbeat_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`Failed to start benchmark run: ${error?.message ?? 'no row returned'}`)
  return data.id as string
}

/** Live progress tick — mirrors cruise_scans.live_steps polling. Updates the
 *  heartbeat so a stalled run is detectable via staleness. */
export async function recordProgress(runId: string, progress: RunProgress): Promise<void> {
  await supabase
    .from('benchmark_runs')
    .update({ progress, heartbeat_at: new Date().toISOString() })
    .eq('id', runId)
}

/** Writes final results and flips the row to 'completed'. */
export async function completeBenchmarkRun(runId: string, run: BenchmarkRun): Promise<void> {
  const { error } = await supabase
    .from('benchmark_runs')
    .update({
      status: 'completed',
      overall_score: run.overallScore,
      category_scores: run.categoryScores,
      metrics: run.metrics,
      suite_results: run.suiteResults,
      heartbeat_at: new Date().toISOString(),
      finished_at: run.finishedAt,
    })
    .eq('id', runId)
  if (error) throw new Error(`Failed to complete benchmark run: ${error.message}`)
}

/** Marks a run failed with a message (set when the run throws). */
export async function failBenchmarkRun(runId: string, message: string): Promise<void> {
  await supabase
    .from('benchmark_runs')
    .update({ status: 'failed', error: message.slice(0, 2000), finished_at: new Date().toISOString() })
    .eq('id', runId)
}

/** Latest completed run per model for this user, as UI-ready aggregates.
 *  No fabricated fallback — a model with no completed run simply isn't here. */
export async function getLatestResults(userId: string): Promise<ModelBenchmark[]> {
  const { data, error } = await supabase
    .from('benchmark_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error || !data) return []

  // Newest-first order means the first row seen per model_id is its latest.
  const seen = new Set<string>()
  const latest: ModelBenchmark[] = []
  for (const row of data as BenchmarkRunRow[]) {
    if (seen.has(row.model_id)) continue
    seen.add(row.model_id)
    latest.push(rowToModelBenchmark(row))
  }
  return latest
}

/** Poll a single run's live status — same shape family as /api/cruise/live-steps. */
export async function getRunStatus(userId: string, runId: string): Promise<RunStatus | null> {
  const { data } = await supabase
    .from('benchmark_runs')
    .select('id, model_id, status, progress, heartbeat_at, finished_at, error')
    .eq('user_id', userId)
    .eq('id', runId)
    .maybeSingle()

  if (!data) return null
  const row = data as Pick<BenchmarkRunRow, 'id' | 'model_id' | 'status' | 'progress' | 'heartbeat_at' | 'finished_at' | 'error'>
  const progress = row.progress && 'total' in row.progress ? (row.progress as RunProgress) : null
  return {
    runId: row.id,
    modelId: row.model_id,
    status: row.status,
    progress,
    heartbeatAt: row.heartbeat_at,
    finishedAt: row.finished_at,
    error: row.error,
  }
}
