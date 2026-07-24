import { createOpenAI } from '@ai-sdk/openai'

// ───────────────────────────────────────────────────────────────────
// Model registry — single source of truth for every model Enry Engine
// exposes to the chat picker, Drive picker, enry lite picker, and server
// routes. Replaces the old NIM-only MODEL_KEYS map. Adding a model:
//   1. Append an entry to MODEL_LIST below (id, label, scopes, etc.)
//   2. Append a provider row to PROVIDERS (baseURL + env-key getter)
// All UI pickers drive off MODEL_LIST — no more inline arrays.
// ───────────────────────────────────────────────────────────────────

export type ModelScope = 'chat' | 'drive' | 'lite'

export interface ModelMeta {
  id: string
  label: string
  company: string
  description: string
  scopes: ModelScope[]
  /** Whether the model's UI defaults to Medium effort (for new/unproven models). */
  defaultEffort?: 'low' | 'medium' | 'high'
  /** Reserved: future flag for models that natively accept image input. */
  supportsVision?: boolean
  /** Whether the model emits <think>-style reasoning traces that the UI can split out. */
  supportsReasoning?: boolean
}

// Client-safe metadata. Pickers read this directly. No secrets here.
export const MODEL_LIST: ModelMeta[] = [
  {
    id: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    company: 'DeepSeek (OpenRouter)',
    description: 'Default. Best for complex tasks.',
    scopes: ['chat', 'drive'],
    defaultEffort: 'high',
    supportsReasoning: true,
  },
  {
    // supportsVision removed — confirmed hanging (TLS connects, zero bytes,
    // 20s timeout) against the live NIM endpoint. It never actually saw an
    // image; the flag was aspirational, not verified.
    id: 'minimaxai/minimax-m3',
    label: 'MiniMax M3',
    company: 'NVIDIA NIM',
    description: 'Fast and capable. Drive-only.',
    scopes: ['drive'],
    defaultEffort: 'medium',
  },
  {
    // supportsVision removed — this model's NIM function is dead (404
    // "Specified function in account ... is not found" even for a plain
    // text completion, confirmed by direct curl), despite still being
    // listed by GET /v1/models. It broke every image upload until
    // describeImage() was pointed at nemotron-nano-12b-v2-vl instead.
    id: 'qwen/qwen3.5-397b-a17b',
    label: 'Qwen 3.5',
    company: 'NVIDIA NIM',
    description: 'Great for analysis.',
    scopes: ['chat', 'drive'],
    supportsReasoning: true,
  },
  {
    id: 'z-ai/glm-5.2',
    label: 'GLM 5.2',
    company: 'NVIDIA NIM',
    description: 'Versatile all-rounder.',
    scopes: ['chat', 'drive'],
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b',
    label: 'Nemotron 3 Ultra',
    company: 'NVIDIA NIM',
    description: 'NVIDIA flagship. Heavy reasoning. Drive-only.',
    scopes: ['drive'],
    defaultEffort: 'high',
    supportsReasoning: true,
  },
  {
    id: 'moonshotai/kimi-k2-instruct',
    label: 'Kimi K2',
    company: 'Moonshot (NIM)',
    description: 'Long-context generalist. Drive-only.',
    scopes: ['drive'],
  },
  // ─── New models ──────────────────────────────────────────
  {
    // Was gemini-3.1-pro-preview — quota-gated at "limit: 0" for every
    // metric on this Google Cloud project (Pro tier requires billing
    // enabled; confirmed via the API's own QuotaFailure detail). Swapped to
    // 3.5 Flash: the newest Flash generation, stable (no -preview suffix,
    // unlike 3-flash-preview), and confirmed working at $0 across repeat
    // calls. Label reflects the real model — do not relabel this "Pro".
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    company: 'Google',
    description: 'Fast multimodal — free-tier quota available (Pro tier requires billing).',
    scopes: ['chat', 'drive'],
    defaultEffort: 'medium',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    company: 'OpenAI (GitHub Models)',
    description: 'Versatile multimodal standard.',
    scopes: ['chat', 'drive', 'lite'],
    defaultEffort: 'medium',
  },
  {
    id: 'moonshotai/kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    company: 'Moonshot (OpenRouter)',
    description: 'Drive-only coding-tuned model.',
    scopes: ['drive'], // ← intentionally NOT in 'chat' or 'lite'
    defaultEffort: 'medium',
  },
  {
    // Confirmed live and vision-capable via direct end-to-end testing
    // against NIM (text sanity check + real image description, both 200
    // OK) — this is what describeImage() already uses for upload-time
    // image summaries. Adding it here makes it a real, selectable chat
    // model so a user can attach an image mid-conversation and have the
    // model actually see it, not just get an auto-generated caption.
    id: 'nvidia/nemotron-nano-12b-v2-vl',
    label: 'Nemotron Nano VL',
    company: 'NVIDIA NIM',
    description: 'Vision-capable — reads images attached in chat.',
    scopes: ['chat', 'drive'],
    defaultEffort: 'medium',
    supportsVision: true,
  },
  {
    id: 'grok-4',
    label: 'Grok 4',
    company: 'xAI',
    description: 'xAI flagship. Strong reasoning and coding.',
    scopes: ['chat', 'drive'],
    defaultEffort: 'high',
    supportsReasoning: true,
  },
]

// Default chat model — falls back here if a request supplies an unknown id.
export const DEFAULT_MODEL_ID = 'deepseek/deepseek-v4-pro'

// ── Provider config (server-only — env reads happen at request time) ──
// baseURL + apiKey getter per model. All three new providers expose
// OpenAI-compatible endpoints, so a single `createOpenAI(...)` does the work
// across all of them — no per-provider SDK install required.
interface ProviderConfig {
  baseURL: string | (() => string)
  getApiKey: () => string
}

const NIM_BASE = 'https://integrate.api.nvidia.com/v1'
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const XAI_BASE = 'https://api.x.ai/v1'
const PROVIDERS: Record<string, ProviderConfig> = {
  // DeepSeek V4 Pro — routed via OpenRouter, not NIM. NIM's deepseek-v4-pro
  // deployment has been persistently DEGRADED (confirmed repeatedly this
  // session: 500s, then 400 "Function id ... DEGRADED function cannot be
  // invoked", stuck across retries). DEEPSEEK_API_KEY was rotated to a real
  // OpenRouter key (sk-or-v1-...) as the workaround; this entry just needed
  // to catch up to that — it was still pointed at NIM_BASE, so the valid
  // OpenRouter key was being sent to NIM and correctly rejected (401).
  'deepseek/deepseek-v4-pro':          { baseURL: OPENROUTER_BASE, getApiKey: () => process.env.DEEPSEEK_API_KEY ?? '' },
  // NIM-hosted models share the endpoint + apiKey lookup.
  'minimaxai/minimax-m3':                 { baseURL: NIM_BASE, getApiKey: () => process.env.MINIMAX_API_KEY ?? '' },
  'qwen/qwen3.5-397b-a17b':            { baseURL: NIM_BASE, getApiKey: () => process.env.QWEN_API_KEY ?? '' },
  'z-ai/glm-5.2':                      { baseURL: NIM_BASE, getApiKey: () => process.env.GLM_API_KEY ?? '' },
  'nvidia/nemotron-3-ultra-550b-a55b': { baseURL: NIM_BASE, getApiKey: () => process.env.NVIDIA_API_KEY ?? '' },
  'moonshotai/kimi-k2-instruct':        { baseURL: NIM_BASE, getApiKey: () => process.env.MOONSHOT_API_KEY ?? process.env.NVIDIA_API_KEY ?? '' },
  // Google Gemini — OpenAI-compatible endpoint at the v1beta/openai subpath.
  // 3.5 Flash, not Pro — Pro tier is quota-gated at 0 on this Cloud project
  // (needs billing enabled), confirmed via GET /v1beta/openai/models plus a
  // real completion at $0. Flash-tier models on the same key work fine.
  'gemini-3.5-flash':                  { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', getApiKey: () => process.env.GEMINI_API_KEY ?? '' },
  // OpenAI gpt-4o via GitHub Models — OpenAI-compatible inference API. The
  // actual env var in .env.local/Vercel is GITHUB_MODELS_API_KEY — this was
  // reading GITHUB_MODELS_TOKEN/GITHUB_TOKEN, neither of which is ever set,
  // so isModelConfigured() always returned false ("no API key configured")
  // even though a valid, working token exists under the real name.
  'gpt-4o':                            { baseURL: 'https://models.inference.ai.azure.com',                getApiKey: () => process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN ?? '' },
  // Moonshot Kimi K2.7 Code via OpenRouter.
  'moonshotai/kimi-k2.7-code':         { baseURL: OPENROUTER_BASE,                      getApiKey: () => process.env.OPENROUTER_API_KEY ?? '' },
  // Same NIM key/endpoint already verified working for describeImage().
  'nvidia/nemotron-nano-12b-v2-vl':    { baseURL: NIM_BASE, getApiKey: () => process.env.NVIDIA_API_KEY ?? '' },
  // xAI Grok — OpenAI-compatible endpoint at api.x.ai.
  'grok-4':                            { baseURL: XAI_BASE, getApiKey: () => process.env.XAI_API_KEY ?? '' },
}

// ─── Lookup helpers (used by pickers + server routes) ──────────────
export function getModelMeta(id: string): ModelMeta | undefined {
  return MODEL_LIST.find((m) => m.id === id)
}

export function listModels(scope?: ModelScope): ModelMeta[] {
  if (!scope) return MODEL_LIST
  return MODEL_LIST.filter((m) => m.scopes.includes(scope))
}

/** Returns the default id for a given scope — first entry in `listModels(scope)`. */
export function defaultModelForScope(scope: ModelScope): string {
  return listModels(scope)[0]?.id ?? DEFAULT_MODEL_ID
}

// ─── Server-only: client + chat model factories ────────────────────
// Use these from API routes. Tree-shake friendly — pickers that only import
// `MODEL_LIST` and `getModelMeta` won't pull createOpenAI into the client bundle.
export function isModelConfigured(id: string): boolean {
  return Boolean(PROVIDERS[id]?.getApiKey())
}

export function nimClientFor(model?: string) {
  const id = model ?? DEFAULT_MODEL_ID
  const provider = PROVIDERS[id] ?? PROVIDERS[DEFAULT_MODEL_ID]
  const apiKey = provider.getApiKey()
  if (!apiKey) throw new Error(`No API key configured for model ${id}`)
  const baseURL = typeof provider.baseURL === 'function' ? provider.baseURL() : provider.baseURL
  return createOpenAI({ baseURL, apiKey })
}

/**
 * One-call helper for `streamText({ model: getChatModel(requested), ... })`.
 * Returns a LanguageModel ready for AI SDK calls. Validates the id is
 * registered but does not enforce scope — that's the caller's job.
 */
export function getChatModel(modelId?: string) {
  const id = modelId ?? DEFAULT_MODEL_ID
  if (!PROVIDERS[id]) {
    // Fall back to default — never let an unknown id take down the route.
    return nimClientFor(DEFAULT_MODEL_ID).chat(DEFAULT_MODEL_ID)
  }
  return nimClientFor(id).chat(id)
}

// ─── Backwards compatibility shim ─────────────────────────────────
// The legacy `DEFAULT_NIM_MODEL` export is still referenced in terminal/exec
// and a few other places. Keep the alias so older imports don't break.
export const DEFAULT_NIM_MODEL = DEFAULT_MODEL_ID

// ─── JSON utilities (unchanged from previous nim.ts) ──────────────
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
