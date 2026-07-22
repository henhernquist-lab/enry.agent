import type { EvaluatorType, BenchmarkCase, CaseResult } from './types'
import { z } from 'zod'

export interface EvaluatorContext {
  response: string
  toolCalls?: { name: string; args?: unknown }[]
}

export function evaluateCase(
  benchCase: BenchmarkCase,
  ctx: EvaluatorContext,
): Pick<CaseResult, 'passed' | 'score'> {
  const response = ctx.response.trim()
  const expectedRaw = benchCase.expected
  const expected = Array.isArray(expectedRaw) ? expectedRaw : expectedRaw ? [expectedRaw] : []
  const normalized = response.toLowerCase()

  switch (benchCase.evaluator) {
    case 'exact_match': {
      const match = expected.some((e) => e.toLowerCase() === normalized)
      return { passed: match, score: match ? 100 : 0 }
    }

    case 'contains':
    case 'contains_all': {
      const allPresent = expected.every((e) => normalized.includes(e.toLowerCase()))
      return { passed: allPresent, score: allPresent ? 100 : 0 }
    }

    case 'json_schema': {
      const candidates: unknown[] = []
      const parsed = extractJson(response)
      if (parsed) candidates.push(parsed)
      // Tool-calling cases often return the structured payload as tool args.
      for (const call of ctx.toolCalls ?? []) {
        if (call.args) candidates.push(call.args)
      }
      if (candidates.length === 0) return { passed: false, score: 0 }
      if (benchCase.expectedSchema) {
        const ok = candidates.some((candidate) => partialDeepMatch(candidate, benchCase.expectedSchema as Record<string, unknown>))
        return { passed: ok, score: ok ? 100 : 0 }
      }
      return { passed: true, score: 100 }
    }

    case 'llm_judge':
      // Reserved for future human-eval-style rubric. For now treat as
      // contains fallback to avoid requiring a second model call.
      if (expected.length) {
        const allPresent = expected.every((e) => normalized.includes(e.toLowerCase()))
        return { passed: allPresent, score: allPresent ? 100 : 0 }
      }
      return { passed: true, score: 100 }

    default:
      return { passed: false, score: 0 }
  }
}

export function extractJson(text: string): unknown | null {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

function partialDeepMatch(actual: unknown, expected: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(expected)) {
    if (actual === null || typeof actual !== 'object') return false
    const actualValue = (actual as Record<string, unknown>)[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (!partialDeepMatch(actualValue as Record<string, unknown>, value as Record<string, unknown>)) return false
    } else {
      if (actualValue !== value) return false
    }
  }
  return true
}

export function computeSuiteScore(caseResults: CaseResult[]): number {
  if (caseResults.length === 0) return 0
  const totalWeight = caseResults.reduce((sum, c) => sum + (c.score ?? 0), 0)
  return Math.round(totalWeight / caseResults.length)
}
