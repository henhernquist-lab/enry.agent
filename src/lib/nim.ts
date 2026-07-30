import { createOpenAI } from '@ai-sdk/openai'

// ───────────────────────────────────────────────────────────────────
// Model registry — single source of truth for every model Golem Engine
// exposes to the chat picker, Drive picker, Shard picker, and server
// routes. Replaces the old NIM-only MODEL_KEYS map. Adding a model:
//   1. Append an entry to MODEL_LIST below (id, label, scopes, etc.)
//   2. Append a provider row to PROVIDERS (baseURL + env-key getter)
// All UI pickers drive off MODEL_LIST — no more inline arrays.
//
// Free-tier final lineup (July 2026 cleanup):
//   * DeepSeek V4 Pro  → OpenRouter (DEEPSEEK_API_KEY / OPENROUTER_API_KEY)
//   * GLM 5.2          → NVIDIA NIM (GLM_API_KEY)
//   * Gemini 3.5 Flash → Google AI Studio (GEMINI_API_KEY)
//   * Llama 3.3 70B    → Groq (GROQ_API_KEY)
//   * Llama 3.1 8B Instant → Groq (GROQ_API_KEY)
//   * GPT-OSS 120B     → Groq (GROQ_API_KEY)
// Models are only shown in pickers if their provider key is configured.
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
  /** Whether the model emits reasoning-style trace content the UI can split out. */
  supportsReasoning?: boolean
  /**
   * Set when a model is known-unreliable at its provider right now. It stays
   * fully selectable — this only drives an honest badge in the pickers and
   * keeps autonomous selection off it. Same principle as the error sanitizer:
   * surface the real state, don't hide it and don't silently block it.
   */
  degraded?: string
  /**
   * Per-model cap on requested output tokens. Groq bills `prompt + max_tokens`
   * against a rolling per-minute budget *whether or not the output is used*, so
   * a blanket 4096 reservation on a 6000 TPM model burns two-thirds of the
   * minute on a reply that may be three words — and a single request with a
   * system prompt plus the tool schemas then exceeds the limit outright and
   * comes back 413. Measured TPM: llama-3.1-8b-instant 6000,
   * openai/gpt-oss-120b 8000, llama-3.3-70b-versatile 12000.
   * Omitted = use the route's default.
   */
  maxOutputTokens?: number
  /**
   * Output reservation to use when tools are attached, overriding
   * `maxOutputTokens` for that turn.
   *
   * A tool-calling turn is not one request — the SDK re-sends the entire
   * context once per step, and Groq both admits and debits on
   * `prompt + max_tokens`, not on tokens actually produced. So the reservation
   * is paid in full again on every step while the prompt only grows, and an
   * unused output budget is what starves the follow-up request.
   *
   * Measured on this route: 2408 tokens of system prompt + 1343 of tool schemas
   * = 3791 fixed per step, and a 5-result Tavily response adds 1489 more. On the
   * 70B that made step 2 ask for 5280 + 4096 = 9376 against ~8193 remaining —
   * the 429 Henry hit ~21s into a web search.
   */
  maxOutputTokensWithTools?: number
  /**
   * Cap on the characters of a single tool result fed back into context.
   * Sized from the model's TPM headroom, since every later step re-sends it.
   */
  toolResultMaxChars?: number
  /**
   * False when a tool round-trip cannot fit the model's per-minute budget at
   * all, so tools are withheld rather than offered and then failing mid-call.
   */
  supportsTools?: boolean
  /**
   * Which chat system prompt this model gets. Omitted = 'full'.
   *
   * 'lean' is the same agent with the same safety rules, at roughly 40% of the
   * tokens — for models whose per-minute budget is spent re-sending the prompt
   * on every step of a tool turn. See src/lib/prompts/system.ts.
   */
  systemPrompt?: 'full' | 'lean'
}

// Client-safe metadata. Pickers read this directly. No secrets here.
// Note: listModels() below filters this list at runtime to only models whose
// provider key is configured, so UI pickers never show a model that cannot
// actually be called.
// Order matters: several call sites treat the first entry of a scope as that
// scope's default (chat/architect routes' CHAT_MODELS[0] fallback,
// defaultModelForScope, Drive auto-select tiebreaks). GLM 5.2 leads so those
// all resolve to the same model DEFAULT_MODEL_ID names — otherwise the
// "default" would silently be whichever model happened to be listed first.
export const MODEL_LIST: ModelMeta[] = [
  {
    id: 'z-ai/glm-5.2',
    label: 'GLM 5.2',
    company: 'NVIDIA NIM',
    description: 'Default. Versatile all-rounder.',
    scopes: ['chat', 'drive'],
  },
  {
    // Was deepseek/deepseek-v4-pro on OpenRouter — removed, not renamed. That
    // account is a free tier that ran out of credit (402: "requested up to 800
    // tokens, but can only afford 197"), which made the app's own default model
    // fail on the first message of every new chat.
    //
    // NIM's catalog carries DeepSeek under a different prefix (deepseek-ai/,
    // not deepseek/), and its v4-pro deployment is still unusable — a real
    // streaming request sat for 150s without returning headers, matching the
    // DEGRADED behaviour that moved DeepSeek off NIM originally. v4-flash is
    // the current DeepSeek on NIM that actually responds, so that's what this
    // entry routes to. It is NOT the default: under shared free-tier load it
    // returns ResourceExhausted a fair fraction of the time (measured 3/5,
    // queue depth 1863/48), so it's offered as a choice, not a foundation.
    id: 'deepseek-ai/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    company: 'DeepSeek (NVIDIA NIM)',
    description: 'Fast DeepSeek. Free-tier capacity is shared — can be busy at peak.',
    scopes: ['chat', 'drive'],
    defaultEffort: 'medium',
    supportsReasoning: true,
  },
  {
    // The full-size DeepSeek, kept selectable alongside Flash rather than
    // replaced by it. NVIDIA's deployment is currently not responding —
    // measured 0/2, a real streaming request held 150s without returning
    // headers — so it carries a degraded badge instead of being hidden or
    // silently dropped. Capacity issues resolve; when it starts answering
    // again, clear `degraded` and it needs no other change.
    id: 'deepseek-ai/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    company: 'DeepSeek (NVIDIA NIM)',
    description: 'Full-size DeepSeek. Strongest on complex tasks when NVIDIA capacity is available.',
    scopes: ['chat', 'drive'],
    defaultEffort: 'high',
    supportsReasoning: true,
    // Re-measured after the initial 0/2 timeouts: it now answers 6/6, but at
    // ~50s per reply versus ~3s for Flash, and it returned nothing at all
    // earlier the same day. Shared NVIDIA free-tier capacity, so the honest
    // label is "slow and unpredictable", not "broken" and not "fine".
    degraded: 'Very slow on shared NVIDIA capacity (~50s replies) and can time out entirely.',
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    company: 'Google',
    description: 'Fast multimodal — free-tier quota available.',
    scopes: ['chat', 'drive'],
    defaultEffort: 'medium',
  },
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B',
    company: 'Groq',
    description: 'Fast, capable generalist on Groq.',
    scopes: ['chat', 'drive'],
    defaultEffort: 'medium',
    systemPrompt: 'lean',
    // 12000 TPM — the default output budget fits comfortably for a plain reply.
    maxOutputTokens: 4096,
    // A tool round-trip is two requests and Groq debits prompt + reservation,
    // so the budget is 2×P1 + results + 2×reservation ≤ 12000.
    //
    // With the lean system prompt P1 is 3617 against the real 22-tool
    // production set (5123 on the full prompt — the prompt was costing more
    // than a third of every step). That leaves 4766 to split instead of 1726,
    // which is what makes 1024 affordable again: 7234 + 800 + 2048 = 10082,
    // with ~1900 to spare on an empty conversation.
    //
    // History is charged on BOTH steps, so that spare covers roughly 950
    // tokens of conversation (~3800 chars) before this goes over.
    maxOutputTokensWithTools: 1024,
    toolResultMaxChars: 2800,
  },
  {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Instant',
    company: 'Groq',
    description: 'Ultra-fast lightweight model on Groq. Chat only — no tools or web search.',
    scopes: ['chat', 'drive'],
    defaultEffort: 'low',
    // Lowest TPM of the lineup (6000/min). At the route's default 4096 a single
    // "hello" — system prompt + tool schemas + the reservation — exceeded the
    // limit and Groq returned 413, which read to the user as the request being
    // rejected for its content. 1024 is ample for this model's short-reply role
    // and leaves ~5000/min for prompt and follow-up turns.
    maxOutputTokens: 1024,
    // No tools — a tool round-trip cannot fit this model's budget at any
    // setting. The fixed overhead of a tool-calling turn (2408 tokens of system
    // prompt + 1343 of tool schemas = ~3791) is already 63% of a 6000 TPM
    // minute, and Groq debits prompt + reservation, so step 1 alone spends
    // 4823 and leaves 1177. Step 2 must re-send that same ~3799-token prompt,
    // so it cannot be admitted even with zero-length results.
    // Measured on a 150s-rested window: step 1 200, step 2 429 with the search
    // results emptied entirely. Truncation and reservation tuning both bottom
    // out above the limit — only a smaller prompt or fewer tools would help.
    // Offering tools here only produces a call that always dies on the
    // follow-up, so they're withheld and the model stays a fast chat-only one.
    supportsTools: false,
  },
  {
    id: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
    company: 'Groq',
    description: 'Open-source OpenAI model hosted on Groq.',
    scopes: ['chat', 'drive'],
    defaultEffort: 'high',
    systemPrompt: 'lean',
    supportsReasoning: true,
    // 8000 TPM — headroom for a longer reply than the 8B, but not the full
    // 4096 default once prompt and tools are counted.
    maxOutputTokens: 2048,
    // Tools restored. Two things changed since they were withheld:
    //
    //   * The lean system prompt drops P1 from 3661 to 2166 against the real
    //     22-tool set, so two steps cost 4332 of the 8000 TPM ceiling instead
    //     of 7322. 1024 reserved + a 1500-char result cap lands at 6810.
    //   * The "cannot emit a tool call below 512 reserved" finding was an
    //     artifact of the test forcing tool_choice. This route sends
    //     tool_choice auto, and under auto this model emits a tool call 3/3 at
    //     1024 reserved. Forcing it is what produced the 400s.
    //
    // 768 rather than 1024: history is charged on both steps, and at 1024 a
    // turn with ~750 tokens of prior conversation measured 8340 against the
    // 8000 ceiling — a real 429, not window noise. 768 with a 1200-char cap
    // brings the same turn to ~7740. This model has the least room of the
    // three and only comfortably supports short conversations.
    maxOutputTokensWithTools: 768,
    toolResultMaxChars: 1200,
  },
]

// Default chat model — falls back here if a request supplies an unknown id.
// GLM 5.2, not DeepSeek: the default is the model every new chat opens on, so
// it has to be the most reliable one available, not the most capable on paper.
// Measured back-to-back on NIM: GLM 5.2 5/5, DeepSeek V4 Flash 3/5
// (ResourceExhausted under shared load). Must never point at an OpenRouter-
// routed model — a credit-exhausted account there is what broke every new chat.
export const DEFAULT_MODEL_ID = 'z-ai/glm-5.2'

// ── Provider config (server-only — env reads happen at request time) ──
// baseURL + apiKey getter per model. All providers expose
// OpenAI-compatible endpoints, so a single `createOpenAI(...)` does the work
// across all of them — no per-provider SDK install required.
interface ProviderConfig {
  baseURL: string | (() => string)
  getApiKey: () => string
  /** Optional per-provider fetch override — used to patch response shapes
   *  that don't match what @ai-sdk/openai expects (see geminiToolCallFetch). */
  fetch?: typeof fetch
}

// Gemini's OpenAI-compatible endpoint (v1beta/openai) streams tool-call
// deltas that omit the per-call `index` field the AI SDK's chat chunk schema
// requires (it uses `index` to accumulate parallel tool calls across
// chunks). Real repro: a tool_calls delta arrives as
//   {"delta":{"tool_calls":[{"extra_content":{...},"function":{...},"id":"...","type":"function"}]}}
// — everything OpenAI's shape has, minus `index` — so Zod's required-field
// check fails with "Type validation failed" and the SDK surfaces the raw
// payload as the stream error instead of a tool call. Since Gemini only ever
// sends one tool call per delta chunk in this shape, position in the array
// (0) is the correct index; this wrapper fills it in before the response
// body reaches the SDK's parser, which is the only point we can intervene at
// (the parsing happens inside @ai-sdk/openai, not in our route code).
function geminiToolCallFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init).then((res) => {
    const contentType = res.headers.get('content-type') ?? ''
    if (!res.body || !contentType.includes('text/event-stream')) return res

    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let buffer = ''

    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          controller.enqueue(encoder.encode(patchSseLine(line) + '\n'))
        }
      },
      flush(controller) {
        if (buffer) controller.enqueue(encoder.encode(patchSseLine(buffer)))
      },
    })

    return new Response(res.body.pipeThrough(transform), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  })
}

function patchSseLine(line: string): string {
  if (!line.startsWith('data: ') || line === 'data: [DONE]') return line
  try {
    const data = JSON.parse(line.slice(6))
    let mutated = false
    for (const choice of data.choices ?? []) {
      const toolCalls = choice?.delta?.tool_calls
      if (Array.isArray(toolCalls)) {
        toolCalls.forEach((tc: Record<string, unknown>, i: number) => {
          if (typeof tc.index !== 'number') {
            tc.index = i
            mutated = true
          }
        })
      }
    }
    return mutated ? `data: ${JSON.stringify(data)}` : line
  } catch {
    return line // not JSON (or malformed) — pass through untouched
  }
}

const NIM_BASE = 'https://integrate.api.nvidia.com/v1'
const GROQ_BASE = 'https://api.groq.com/openai/v1'
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

const PROVIDERS: Record<string, ProviderConfig> = {
  // DeepSeek V4 Flash — NVIDIA NIM, same baseURL + client path as GLM 5.2.
  // DEEPSEEK_API_KEY now holds an nvapi-* key (verified working against NIM);
  // NVIDIA_API_KEY is the fallback. No OpenRouter route remains in this
  // registry — see the MODEL_LIST entry for why it was removed outright.
  'deepseek-ai/deepseek-v4-flash': {
    baseURL: NIM_BASE,
    getApiKey: () => process.env.DEEPSEEK_API_KEY ?? process.env.NVIDIA_API_KEY ?? '',
  },
  // DeepSeek V4 Pro — same NIM endpoint and key path as Flash.
  'deepseek-ai/deepseek-v4-pro': {
    baseURL: NIM_BASE,
    getApiKey: () => process.env.DEEPSEEK_API_KEY ?? process.env.NVIDIA_API_KEY ?? '',
  },
  // GLM 5.2 — NVIDIA NIM, confirmed live and free-tier capable.
  'z-ai/glm-5.2': {
    baseURL: NIM_BASE,
    getApiKey: () => process.env.GLM_API_KEY ?? '',
  },
  // Google Gemini — OpenAI-compatible endpoint at the v1beta/openai subpath.
  // 3.5 Flash, not Pro — Pro tier is quota-gated at 0 on this Cloud project
  // (needs billing enabled), confirmed via GET /v1beta/openai/models plus a
  // real completion at $0. Flash-tier models on the same key work fine.
  // fetch: geminiToolCallFetch — patches missing `index` on streamed tool-call
  // deltas (see the function's doc comment); without it, any Gemini message
  // that triggers a tool call fails with a raw Zod validation-error dump.
  'gemini-3.5-flash': {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    getApiKey: () => process.env.GEMINI_API_KEY ?? '',
    fetch: geminiToolCallFetch,
  },
  // Groq-hosted free-tier models. All three share the Groq OpenAI-compatible
  // endpoint and GROQ_API_KEY. They are filtered out of pickers when the key
  // is missing (see listModels below).
  'llama-3.3-70b-versatile': {
    baseURL: GROQ_BASE,
    getApiKey: () => process.env.GROQ_API_KEY ?? '',
  },
  'llama-3.1-8b-instant': {
    baseURL: GROQ_BASE,
    getApiKey: () => process.env.GROQ_API_KEY ?? '',
  },
  'openai/gpt-oss-120b': {
    baseURL: GROQ_BASE,
    getApiKey: () => process.env.GROQ_API_KEY ?? '',
  },
}

// Runtime diagnostic: if Groq models are in the registry but no GROQ_API_KEY
// is set, warn once so the operator knows why they are not selectable.
// Server-only: this module is imported by client components, where every
// non-NEXT_PUBLIC env var is undefined — without the window guard this warning
// fires in every visitor's browser console regardless of the real server config.
if (typeof window === 'undefined' && typeof process !== 'undefined' && !process.env.GROQ_API_KEY) {
  console.warn('[nim] GROQ_API_KEY is missing. Groq models (Llama 3.3 70B, Llama 3.1 8B Instant, GPT-OSS 120B) are still listed in pickers but will fail on use until the key is set.')
}

// ─── Lookup helpers (used by pickers + server routes) ──────────────
export function getModelMeta(id: string): ModelMeta | undefined {
  return MODEL_LIST.find((m) => m.id === id)
}

// CLIENT-SAFE — must stay pure (scope filter only, no process.env reads).
//
// This is imported at module scope by client components ('use client':
// agent/page.tsx, center-panel.tsx, m/chat/page.tsx). Provider keys are
// server-only secrets: Next.js inlines just NEXT_PUBLIC_* into the client
// bundle, so any process.env.*_API_KEY read here is undefined in the browser.
// A previous version filtered by isModelConfigured() and so returned the full
// list during SSR but [] after hydration — which collapsed every picker to
// zero first-party models and crashed /agent on `MODELS[0].id`. Keep env
// access out of this function; use listConfiguredModels() on the server.
export function listModels(scope?: ModelScope): ModelMeta[] {
  return scope ? MODEL_LIST.filter((m) => m.scopes.includes(scope)) : MODEL_LIST
}

/**
 * SERVER-ONLY: models whose provider key is actually configured. Use this for
 * autonomous selection (which must never pick a model that can't run) and for
 * telling clients what's available. Never call from a client component.
 */
export function listConfiguredModels(scope?: ModelScope): ModelMeta[] {
  return listModels(scope).filter((m) => isModelConfigured(m.id))
}

/** Returns the default id for a given scope — first configured entry. */
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
  return createOpenAI({ baseURL, apiKey, ...(provider.fetch ? { fetch: provider.fetch } : {}) })
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
