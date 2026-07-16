import { createOpenAI } from '@ai-sdk/openai'

// Shared NVIDIA NIM client factory. The default model is DeepSeek V4 Pro; the
// Aperture, Chief of Staff, and Root Cause features all route through it.
//
// IMPORTANT: NIM only speaks the /v1/chat/completions API, so callers must use
// `.chat(model)` on the returned client, never the client directly (which
// defaults to the Responses API).

export const DEFAULT_NIM_MODEL = 'deepseek-ai/deepseek-v4-pro'

// NVIDIA NIM hosts every model through the same /v1/chat/completions endpoint
// with the same auth header — the only thing that changes per model is the
// API key. New models are added by extending MODEL_KEYS and providing their
// own NIM_API_KEY env var (matching their vendor prefix).
const MODEL_KEYS: Record<string, () => string> = {
  'deepseek-ai/deepseek-v4-pro': () => process.env.DEEPSEEK_API_KEY ?? '',
  'minimax/minimax-m3': () => process.env.MINIMAX_API_KEY ?? '',
  'qwen/qwen3.5-122b-a10b': () => process.env.QWEN_API_KEY ?? '',
  'z-ai/glm-5.2': () => process.env.GLM_API_KEY ?? '',
  'nvidia/nemotron-3-ultra-550b-a55b': () => process.env.NVIDIA_API_KEY ?? '',
  // Moonshot Kimi K2 Instruct — 6th NIM model. Same NVIDIA NIM endpoint
  // (integrate.api.nvidia.com/v1) as the others; only the key changes.
  'moonshotai/kimi-k2-instruct': () => process.env.MOONSHOT_API_KEY ?? process.env.NVIDIA_API_KEY ?? '',
}

export function nimClientFor(model: string = DEFAULT_NIM_MODEL) {
  const apiKey = (MODEL_KEYS[model] ?? MODEL_KEYS[DEFAULT_NIM_MODEL])()
  if (!apiKey) throw new Error(`No API key configured for NIM model ${model}`)
  return createOpenAI({ baseURL: 'https://integrate.api.nvidia.com/v1', apiKey })
}

// Strips markdown code fences that models sometimes wrap JSON in, then parses.
export function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Fall back to the first balanced-looking {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        return null
      }
    }
    return null
  }
}
