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
    id: 'minimaxai/minimax-m3',
    label: 'MiniMax M3',
    company: 'NVIDIA NIM',
    description: 'Fast and capable. Drive-only. (Still live on NIM catalog — M2.7 not found.)',
    scopes: ['drive'],
    defaultEffort: 'medium',
    supportsVision: true,
  },
  {
    // Replaces qwen/qwen3.5-397b-a17b — deprecated/retired by NIM as of
    // July 27, 2026. Qwen3 Coder 480B is the current coding-tuned model on
    // NIM, live and confirmed working.
    id: 'qwen/qwen3-coder-480b-a35b-instruct',
    label: 'Qwen3 Coder',
    company: 'NVIDIA NIM',
    description: 'Coding-tuned 480B. Replaces deprecated Qwen 3.5 397B.',
    scopes: ['chat', 'drive'],
    defaultEffort: 'medium',
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
    // xAI Grok — OpenAI-compatible endpoint. Model ID "grok-4.5" is the
    // current flagship per docs.x.ai. Drive-only: strong coding/reasoning
    // model suitable for agentic work. Chat scope can be added later.
    id: 'grok-4.5',
    label: 'Grok 4.5',
    company: 'xAI',
    description: 'xAI flagship. Strong reasoning. Drive-only.',
    scopes: ['drive'],
    defaultEffort: 'medium',
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
// Hugging Face Inference Providers router — OpenAI-compatible. Community
// models added from The Black Market route here (see COMMUNITY_MODEL_PREFIX).
const HF_ROUTER_BASE = 'https://router.huggingface.co/v1'

// ── Community models (The Black Market) ─────────────────────────────
// Community models aren't in the static MODEL_LIST/PROVIDERS above — they're
// added at runtime and persisted in Supabase (community_models). Their id is
// self-describing so routing needs no DB lookup at call time:
//   community:<hfId>:<provider>
//   e.g. community:NousResearch/Hermes-3-Llama-3.1-8B:featherless-ai
// The part after the prefix is exactly the model param the HF router expects.
export const COMMUNITY_MODEL_PREFIX = 'community:'

export function isCommunityModelId(id: string): boolean {
  return id.startsWith(COMMUNITY_MODEL_PREFIX)
}

/** The HF-router model param for a community id (strips the marker prefix). */
export function communityRouteParam(id: string): string {
  return id.slice(COMMUNITY_MODEL_PREFIX.length)
}

// ── Gemini SSE response transform ───────────────────────────────────
// Gemini's OpenAI-compatible streaming endpoint wraps tool_call deltas in
// an `extra_content` field containing `google.thought_signature`. The
// OpenAI SDK's type validation rejects this non-standard field during
// streaming, producing "Type validation failed" errors that leak raw
// provider JSON to the UI. This transform strips `extra_content` from
// tool_calls in SSE data lines before the SDK parses them, targeting
// only Gemini's endpoint.

const GEMINI_MODEL_ID = 'gemini-3.5-flash'

function createGeminiFetch(): typeof fetch {
  const originalFetch = globalThis.fetch.bind(globalThis)
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream')) return response

    // Pipe the streaming response through a transform that strips
    // `extra_content` from tool_calls in each SSE data line.
    const reader = response.body?.getReader()
    if (!reader) return response

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    let buffer = ''

    const transformedStream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            if (buffer) {
              controller.enqueue(encoder.encode(buffer))
              buffer = ''
            }
            controller.close()
            return
          }
          buffer += decoder.decode(value, { stream: true })

          // Process complete lines
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // keep the incomplete last line

          const processed = lines.map((line) => {
            if (!line.startsWith('data: ') && !line.startsWith('data:')) return line
            const prefix = line.startsWith('data: ') ? 'data: ' : 'data:'
            const jsonStr = line.slice(prefix.length).trim()
            if (!jsonStr || jsonStr === '[DONE]') return line

            // Strip extra_content from tool_calls in delta chunks
            try {
              const cleaned = jsonStr.replace(
                /"extra_content"\s*:\s*\{[^}]*\}\s*,?/g,
                '',
              )
              // Clean up trailing commas from removed fields: ,} → }
              const fixed = cleaned.replace(/,}/g, '}')
              if (fixed !== jsonStr) return prefix + fixed
            } catch {
              // If parsing fails, pass the line through unchanged
            }
            return line
          })

          controller.enqueue(encoder.encode(processed.join('\n')))
        } catch (err) {
          console.error('[nim] gemini stream transform error:', err)
          controller.error(err)
        }
      },
      cancel() {
        reader.cancel()
      },
    })

    return new Response(transformedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}

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
  'minimaxai/minimax-m3':                        { baseURL: NIM_BASE, getApiKey: () => process.env.MINIMAX_API_KEY ?? '' },
  'qwen/qwen3-coder-480b-a35b-instruct':        { baseURL: NIM_BASE, getApiKey: () => process.env.QWEN_API_KEY ?? '' },
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
  // xAI Grok — OpenAI-compatible at api.x.ai/v1. Uses XAI_API_KEY.
  'grok-4.5':                          { baseURL: 'https://api.x.ai/v1',                getApiKey: () => process.env.XAI_API_KEY ?? '' },
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
const hfRouterKey = () => process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN ?? ''

export function isModelConfigured(id: string): boolean {
  if (isCommunityModelId(id)) return Boolean(hfRouterKey())
  return Boolean(PROVIDERS[id]?.getApiKey())
}

export function nimClientFor(model?: string) {
  const id = model ?? DEFAULT_MODEL_ID
  if (isCommunityModelId(id)) {
    const apiKey = hfRouterKey()
    if (!apiKey) throw new Error('No Hugging Face API key configured (HUGGINGFACE_API_KEY)')
    return createOpenAI({ baseURL: HF_ROUTER_BASE, apiKey })
  }
  const provider = PROVIDERS[id] ?? PROVIDERS[DEFAULT_MODEL_ID]
  const apiKey = provider.getApiKey()
  if (!apiKey) throw new Error(`No API key configured for model ${id}`)
  const baseURL = typeof provider.baseURL === 'function' ? provider.baseURL() : provider.baseURL
  const client = createOpenAI({ baseURL, apiKey })
  // Attach Gemini SSE transform — strips extra_content from tool_call
  // deltas before the SDK parses them. No-op for non-Gemini providers.
  if (id === GEMINI_MODEL_ID) {
    return createOpenAI({ baseURL, apiKey, fetch: createGeminiFetch() })
  }
  return client
}

/**
 * One-call helper for `streamText({ model: getChatModel(requested), ... })`.
 * Returns a LanguageModel ready for AI SDK calls. Validates the id is
 * registered (or a community id) but does not enforce scope — caller's job.
 */
export function getChatModel(modelId?: string) {
  const id = modelId ?? DEFAULT_MODEL_ID
  if (isCommunityModelId(id)) {
    return nimClientFor(id).chat(communityRouteParam(id))
  }
  if (!PROVIDERS[id]) {
    // Fall back to default — never let an unknown id take down the route.
    return nimClientFor(DEFAULT_MODEL_ID).chat(DEFAULT_MODEL_ID)
  }
  return nimClientFor(id).chat(id)
}

/**
 * Warm up a community model before streaming. HF Inference Providers load
 * less-popular models on demand; the router returns 503 for the first
 * ~15–45s while the provider spins the model up (confirmed against
 * featherless-ai). A tiny non-streaming completion with retries lets that
 * cold start happen here — where we can retry — instead of erroring the
 * user's stream. Best-effort: returns true once warm, false if it never
 * came up in the budget (the caller can still attempt the stream).
 */
export async function warmCommunityModel(
  id: string,
  opts: { attempts?: number; timeoutMs?: number; gapMs?: number } = {},
): Promise<boolean> {
  if (!isCommunityModelId(id)) return true
  const apiKey = hfRouterKey()
  if (!apiKey) return false
  // Defaults are bounded so a caller with a tight request budget (e.g. the
  // chat route's maxDuration) can't be pushed over it: worst case here is
  // ~3×12s + 2×6s ≈ 48s. A warm model returns on the first ~1s ping.
  const attempts = opts.attempts ?? 3
  const timeoutMs = opts.timeoutMs ?? 12_000
  const gapMs = opts.gapMs ?? 6_000
  const param = communityRouteParam(id)
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${HF_ROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: param, messages: [{ role: 'user', content: 'ok' }], max_tokens: 1 }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return true
    } catch {
      // timeout / network — treat as still-cold and retry
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, gapMs))
  }
  return false
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
