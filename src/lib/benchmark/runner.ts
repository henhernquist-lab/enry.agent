import { generateText } from 'ai'
import { getChatModel, isModelConfigured, type ModelMeta } from '@/lib/nim'
import { estimateCostUsd } from '@/lib/usage/pricing'
import { randomUUID } from 'crypto'
import type { BenchmarkSuite, BenchmarkCase, BenchmarkRun, SuiteResult, CaseResult, BenchmarkCategory } from './types'
import { evaluateCase } from './scoring'

const DEFAULT_CASE_TIMEOUT_MS = 60_000

interface RunOptions {
  modelId: string
  suites?: BenchmarkSuite[]
  onProgress?: (payload: { suite: string; caseId: string; completed: number; total: number }) => void
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

export async function runBenchmark(options: RunOptions): Promise<BenchmarkRun> {
  const { modelId, suites = [], onProgress } = options
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()

  if (!isModelConfigured(modelId)) {
    throw new Error(`Model ${modelId} is not configured with an API key`)
  }

  const model = getChatModel(modelId)
  const suiteResults: SuiteResult[] = []
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCostUsd = 0
  let totalLatencyMs = 0
  let successCount = 0
  let caseCount = 0

  const totalCases = suites.reduce((sum, s) => sum + s.cases.length, 0)
  let completed = 0

  for (const suite of suites) {
    const caseResults: CaseResult[] = []
    let suiteLatencyMs = 0
    let suiteCost = 0
    let suiteSuccesses = 0

    if (suite.cases.length === 0) {
      // Derived category: latency, cost-efficiency, reliability — computed after runs.
      suiteResults.push({
        suiteId: suite.id,
        category: suite.category,
        score: 0,
        caseResults: [],
        avgLatencyMs: 0,
        totalCostUsd: 0,
        successRate: 0,
      })
      continue
    }

    for (const benchCase of suite.cases) {
      const caseStart = Date.now()
      let responseText = ''
      let toolCalls: { name: string; args?: unknown }[] = []
      let promptTokens = 0
      let completionTokens = 0

      try {
        const messages: { role: 'user'; content: string }[] = [{ role: 'user', content: benchCase.prompt }]
        const system = benchCase.system

        const result = await withTimeout(
          generateText({
            model,
            messages,
            system,
            tools: benchCase.tools as Record<string, unknown> as Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
            maxRetries: 0,
            maxOutputTokens: 4096,
          }),
          benchCase.timeoutMs ?? DEFAULT_CASE_TIMEOUT_MS,
        )

        responseText = result.text
        promptTokens = result.usage?.inputTokens ?? 0
        completionTokens = result.usage?.outputTokens ?? 0
        toolCalls = result.toolCalls?.map((t) => ({ name: t.toolName, args: 'input' in t ? t.input : undefined })) ?? []
      } catch (err) {
        responseText = ''
      }

      const latencyMs = Date.now() - caseStart
      const inputTokens = promptTokens
      const outputTokens = completionTokens
      const costUsd = estimateCostUsd(modelId, inputTokens, outputTokens)

      const evaluation = evaluateCase(benchCase, { response: responseText, toolCalls })

      const caseResult: CaseResult = {
        caseId: benchCase.id,
        passed: evaluation.passed,
        score: evaluation.score,
        latencyMs,
        inputTokens,
        outputTokens,
        costUsd,
        response: responseText.slice(0, 1000),
        toolCalls: toolCalls.map((t) => t.name),
      }

      if (evaluation.passed) successCount++
      caseCount++

      totalInputTokens += inputTokens
      totalOutputTokens += outputTokens
      totalCostUsd += costUsd
      totalLatencyMs += latencyMs
      suiteLatencyMs += latencyMs
      suiteCost += costUsd
      if (evaluation.passed) suiteSuccesses++

      caseResults.push(caseResult)
      completed++
      onProgress?.({ suite: suite.id, caseId: benchCase.id, completed, total: totalCases })
    }

    const score = caseResults.length ? Math.round(caseResults.reduce((s, c) => s + c.score, 0) / caseResults.length) : 0
    const successRate = caseResults.length ? Math.round((caseResults.filter((c) => c.passed).length / caseResults.length) * 100) : 0

    suiteResults.push({
      suiteId: suite.id,
      category: suite.category,
      score,
      caseResults,
      avgLatencyMs: caseResults.length ? Math.round(suiteLatencyMs / caseResults.length) : 0,
      totalCostUsd: suiteCost,
      successRate,
    })
  }

  // Derived category scores.
  const allCaseResults = suiteResults.flatMap((s) => s.caseResults)
  const derivedLatencyScore = computeLatencyScore(allCaseResults)
  const derivedCostScore = computeCostEfficiencyScore(allCaseResults)
  const derivedReliabilityScore = caseCount ? Math.round((successCount / caseCount) * 100) : 0

  const latencySuite = suiteResults.find((s) => s.category === 'latency')
  if (latencySuite) latencySuite.score = derivedLatencyScore

  const costSuite = suiteResults.find((s) => s.category === 'costEfficiency')
  if (costSuite) costSuite.score = derivedCostScore

  const reliabilitySuite = suiteResults.find((s) => s.category === 'reliability')
  if (reliabilitySuite) {
    reliabilitySuite.score = derivedReliabilityScore
    reliabilitySuite.successRate = derivedReliabilityScore
  }

  const categoryScores: Record<BenchmarkCategory, number> = {} as Record<BenchmarkCategory, number>
  for (const s of suiteResults) {
    categoryScores[s.category] = s.score
  }

  const overallScore = computeOverallScore(suiteResults)
  const finishedMs = Date.now()
  const totalTokens = totalInputTokens + totalOutputTokens

  return {
    runId,
    modelId,
    startedAt,
    finishedAt: new Date(finishedMs).toISOString(),
    suiteResults,
    categoryScores,
    overallScore,
    metrics: {
      avgLatencyMs: caseCount ? Math.round(totalLatencyMs / caseCount) : 0,
      tokensPerSec: totalLatencyMs > 0 && totalTokens > 0 ? Math.round((totalTokens / (totalLatencyMs / 1000))) : 0,
      avgCostUsd: caseCount ? totalCostUsd / caseCount : 0,
      successRate: caseCount ? Math.round((successCount / caseCount) * 100) : 0,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
    },
  }
}

function computeLatencyScore(caseResults: CaseResult[]): number {
  if (caseResults.length === 0) return 0
  const avg = caseResults.reduce((s, c) => s + c.latencyMs, 0) / caseResults.length
  // Score: <1s = 100, >10s = 0, linear in between.
  if (avg <= 1000) return 100
  if (avg >= 10000) return 0
  return Math.round(100 - ((avg - 1000) / 9000) * 100)
}

function computeCostEfficiencyScore(caseResults: CaseResult[]): number {
  if (caseResults.length === 0) return 0
  const totalTokens = caseResults.reduce((s, c) => s + c.inputTokens + c.outputTokens, 0)
  const totalCost = caseResults.reduce((s, c) => s + c.costUsd, 0)
  if (totalTokens === 0) return 50
  const costPerM = (totalCost / totalTokens) * 1_000_000
  // Score: $0.5/M = 100, $5/M = 0.
  if (costPerM <= 0.5) return 100
  if (costPerM >= 5) return 0
  return Math.round(100 - ((costPerM - 0.5) / 4.5) * 100)
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  coding: 20,
  reasoning: 20,
  math: 5,
  writing: 4,
  summarization: 3,
  toolCalling: 10,
  longContext: 8,
  instructionFollowing: 8,
  latency: 10,
  costEfficiency: 2,
  reliability: 10,
  jsonStructured: 10,
}

function computeOverallScore(suiteResults: SuiteResult[]): number {
  let totalWeight = 0
  let weightedSum = 0
  for (const s of suiteResults) {
    const weight = DEFAULT_WEIGHTS[s.category] ?? 1
    totalWeight += weight
    weightedSum += s.score * weight
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
}
