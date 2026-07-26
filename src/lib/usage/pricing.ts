import { MODEL_LIST } from '@/lib/nim'

export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPer1m: number
  /** USD per 1M output tokens. */
  outputPer1m: number
}

// Estimated USD per 1M tokens. Sourced from public provider pricing pages and
// treated as estimates for internal dashboards / cost reasons — NOT billing.
// Unknown models default to a conservative mid-tier estimate. Adjust these as
// providers publish updates; the dashboard + router cost reasons read from
// here, so a single edit propagates everywhere.
const DEFAULT_PRICING: ModelPricing = { inputPer1m: 1.5, outputPer1m: 6 }

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'deepseek/deepseek-v4-pro':           { inputPer1m: 1.1, outputPer1m: 4.4 },
  'minimaxai/minimax-m3':               { inputPer1m: 1.0, outputPer1m: 2.0 },
  'qwen/qwen3.5-397b-a17b':             { inputPer1m: 1.2, outputPer1m: 3.0 },
  'z-ai/glm-5.2':                       { inputPer1m: 1.0, outputPer1m: 2.5 },
  'nvidia/nemotron-3-ultra-550b-a55b':  { inputPer1m: 2.0, outputPer1m: 5.0 },
  'moonshotai/kimi-k2-instruct':        { inputPer1m: 1.2, outputPer1m: 3.5 },
  'gemini-3.5-flash':                   { inputPer1m: 0.3, outputPer1m: 1.2 },
  'gpt-4o':                             { inputPer1m: 2.5, outputPer1m: 10 },
  'moonshotai/kimi-k2.7-code':          { inputPer1m: 1.0, outputPer1m: 4.0 },
  'grok-4':                             { inputPer1m: 3.0, outputPer1m: 15 },
}

export function getPricing(modelId: string): ModelPricing {
  return MODEL_PRICING[modelId] ?? DEFAULT_PRICING
}

/** Estimated USD cost for a single call. µUSD precision (6 decimals). */
export function estimateCostUsd(modelId: string, promptTokens: number, completionTokens: number): number {
  const p = getPricing(modelId)
  const cost = (promptTokens / 1_000_000) * p.inputPer1m + (completionTokens / 1_000_000) * p.outputPer1m
  return Math.round(cost * 1_000_000) / 1_000_000
}

export type CostTier = 'lowest' | 'low' | 'mid' | 'high'

/**
 * Relative cost tier for a model vs the rest of the registry — drives the
 * "lowest cost" router reason. Blended rate assumes ~4:1 output:input for a
 * typical reply, then compared against registry quartiles.
 */
export function costTierFor(modelId: string): CostTier {
  const p = getPricing(modelId)
  const blended = p.inputPer1m * 0.2 + p.outputPer1m * 0.8
  const allBlended = MODEL_LIST.map((m) => {
    const mp = getPricing(m.id)
    return mp.inputPer1m * 0.2 + mp.outputPer1m * 0.8
  }).sort((a, b) => a - b)
  if (allBlended.length === 0) return 'mid'
  const min = allBlended[0]
  if (blended <= min * 1.05) return 'lowest'
  const q1 = allBlended[Math.floor(allBlended.length * 0.25)]
  const q3 = allBlended[Math.floor(allBlended.length * 0.75)]
  if (blended <= q1) return 'low'
  if (blended >= q3) return 'high'
  return 'mid'
}
