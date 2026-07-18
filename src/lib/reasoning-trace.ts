/**
 * Reasoning Trace — parses the <think>...</think> tags that some models emit
 * to separate chain-of-thought from the final answer. Only models known to
 * emit these tags get extra thinking enabled (see reasoningExtraBody); for
 * the rest the request just goes through without the param.
 *
 * Capability lookup is now delegated to MODEL_LIST in src/lib/nim.ts so
 * adding a reasoning-capable model is as simple as flipping its
 * `supportsReasoning: true` flag.
 */

import { getModelMeta } from './nim'

export type ReasoningDepth = 'off' | 'summary' | 'full'

export interface ReasoningTrace {
  reasoning: string | null
  answer: string
}

/** Streaming-aware trace — used during live generation to detect partial <think> blocks. */
export interface StreamingReasoningTrace {
  reasoning: string | null
  answer: string
  isThinking: boolean
}

/**
 * Parses model output during STREAMING — handles incomplete <think> tags.
 * Uses indexOf instead of regex so partial/unclosed tags are detected correctly.
 */
export function parseStreamingReasoning(text: string): StreamingReasoningTrace {
  const openIdx = text.indexOf('<think>')
  if (openIdx === -1) return { reasoning: null, answer: text, isThinking: false }

  const closeIdx = text.indexOf('</think>')
  if (closeIdx === -1) {
    // Mid-stream: <think> opened, not yet closed — accumulate everything after it
    const reasoning = text.slice(openIdx + 7).trimStart()
    return { reasoning: reasoning || null, answer: text.slice(0, openIdx), isThinking: true }
  }

  // Complete <think> block
  const reasoning = text.substring(openIdx + 7, closeIdx).trim()
  const answer = (text.slice(0, openIdx) + text.slice(closeIdx + 8)).trim()
  return { reasoning: reasoning || null, answer: answer || text, isThinking: false }
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

// ─── Reasoning capability lookup ─────────────────────────────────
// New models default to NO reasoning support — opt-in by adding
// `supportsReasoning: true` to the MODEL_LIST entry when an upstream is
// verified to emit `<think>`-style reasoning on its own.
export function modelSupportsReasoning(model: string): boolean {
  return getModelMeta(model)?.supportsReasoning === true
}

/** Extra body parameters to enable thinking on supported models. */
export function reasoningExtraBody(_model: string): Record<string, unknown> | undefined {
  return { chat_template_kwargs: { enable_thinking: true } }
}
