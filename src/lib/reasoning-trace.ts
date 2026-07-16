/**
 * Reasoning Trace — parses the <think>...</think> tags that NVIDIA NIM
 * reasoning-capable models embed in their output to separate the model's
 * chain-of-thought from its final answer.
 *
 * Not all models emit these tags. When they don't, reasoning is null and
 * the entire text is treated as the answer.
 */

export type ReasoningDepth = 'off' | 'summary' | 'full'

export interface ReasoningTrace {
  reasoning: string | null
  answer: string
}

/** Splits a model response into reasoning trace + clean answer. */
export function parseReasoningTrace(text: string): ReasoningTrace {
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/)
  if (!thinkMatch) return { reasoning: null, answer: text }
  const reasoning = thinkMatch[1].trim()
  const answer = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim()
  return { reasoning: reasoning || null, answer: answer || text }
}

/** Renders a reasoning trace at the requested depth. */
export function renderReasoningTrace(reasoning: string | null, depth: ReasoningDepth): string | null {
  if (!reasoning || depth === 'off') return null
  if (depth === 'summary') {
    const firstPara = reasoning.split('\n\n')[0] ?? reasoning
    return firstPara.length > 300 ? firstPara.slice(0, 300) + '…' : firstPara
  }
  return reasoning // full
}

/**
 * Models known to support reasoning traces via <think> tags (or equivalent) on
 * NVIDIA NIM. For models NOT in this set, we don't pass `enable_thinking` —
 * it would be silently ignored or, worse, cause an error.
 */
const REASONING_CAPABLE_MODELS = new Set([
  'deepseek-ai/deepseek-v4-pro',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'qwen/qwen3.5-122b-a10b',
])

export function modelSupportsReasoning(model: string): boolean {
  return REASONING_CAPABLE_MODELS.has(model)
}

/** Extra body parameters to enable thinking on supported NIM models. */
export function reasoningExtraBody(model: string): Record<string, unknown> | undefined {
  if (!modelSupportsReasoning(model)) return undefined
  return {
    chat_template_kwargs: { enable_thinking: true },
  }
}
