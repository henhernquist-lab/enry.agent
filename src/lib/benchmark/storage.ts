import { promises as fs } from 'fs'
import path from 'path'
import type { BenchmarkRun, ModelBenchmark, BenchmarkStorage, BenchmarkCategory } from './types'
import { MODEL_LIST } from '@/lib/nim'
import { getPricing } from '@/lib/usage/pricing'

const STORAGE_DIR = path.join(process.cwd(), '.data', 'benchmarks')
const LATEST_FILE = path.join(STORAGE_DIR, 'latest.json')
const HISTORY_DIR = path.join(STORAGE_DIR, 'history')

async function ensureStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true })
  await fs.mkdir(HISTORY_DIR, { recursive: true })
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

function aggregateToModelBenchmark(run: BenchmarkRun): ModelBenchmark {
  const totalTokens = run.metrics.totalInputTokens + run.metrics.totalOutputTokens
  const avgCostPerM = totalTokens > 0 ? (run.metrics.totalCostUsd / totalTokens) * 1_000_000 : 0
  return {
    modelId: run.modelId,
    overall: run.overallScore,
    categories: Object.entries(run.categoryScores).map(([category, score]) => ({ category: category as BenchmarkCategory, score })),
    avgLatencyMs: run.metrics.avgLatencyMs,
    avgTokensPerSec: run.metrics.tokensPerSec,
    avgCostPerMTokens: avgCostPerM,
    estimatedCostPerMTokens: avgCostPerM,
    contextWindow: contextWindowFor(run.modelId),
    successRate: run.metrics.successRate,
    lastBenchmarkedAt: run.finishedAt,
    benchmarkCount: 1,
    provider: providerFor(run.modelId),
    runId: run.runId,
  }
}

export function createBenchmarkStorage(): BenchmarkStorage {
  return {
    async saveRun(run: BenchmarkRun) {
      await ensureStorage()

      // Append history.
      const historyFile = path.join(HISTORY_DIR, `${run.modelId}.jsonl`)
      const line = JSON.stringify(run) + '\n'
      await fs.appendFile(historyFile, line, 'utf8')

      // Update latest.json map.
      let latest: Record<string, ModelBenchmark> = {}
      try {
        const existing = await fs.readFile(LATEST_FILE, 'utf8')
        latest = JSON.parse(existing)
      } catch {
        // Fresh start.
      }
      latest[run.modelId] = aggregateToModelBenchmark(run)
      await fs.writeFile(LATEST_FILE, JSON.stringify(latest, null, 2), 'utf8')
    },

    async getLatestResults(): Promise<ModelBenchmark[]> {
      try {
        const data = await fs.readFile(LATEST_FILE, 'utf8')
        const map = JSON.parse(data) as Record<string, ModelBenchmark>
        return Object.values(map)
      } catch {
        return []
      }
    },

    async getHistory(modelId: string, limit = 50): Promise<BenchmarkRun[]> {
      try {
        const historyFile = path.join(HISTORY_DIR, `${modelId}.jsonl`)
        const data = await fs.readFile(historyFile, 'utf8')
        const lines = data.trim().split('\n').filter(Boolean)
        return lines.slice(-limit).map((line) => JSON.parse(line) as BenchmarkRun)
      } catch {
        return []
      }
    },
  }
}

export const benchmarkStorage = createBenchmarkStorage()
