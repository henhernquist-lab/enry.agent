import { createHash } from 'node:crypto'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { supabase } from '@/lib/supabase'

// Goal-mode editor calls generate a full file body; a reasoning model on a
// larger file can run well past 60s and hit a Vercel function timeout (504) —
// which the runner then retries, but a deterministic timeout just times out
// again. Give generation real room. Vercel caps this at the plan's max, so a
// high value is safe (helps on Pro/Fluid, no-op on a lower cap).
export const maxDuration = 300

// The metered LLM proxy a goal-run's GitHub Actions runner calls to think.
// Keeps the real NIM key server-side (never in the target repo) and is the
// authoritative budget backstop: every completion first reserves a slot
// against cruise_goal_runs.cap_steps, so even a runaway/looping runner
// physically cannot spend past the cap — the runner's own step counting is a
// courtesy, this is the enforcement. Token-authed like /api/cruise/ingest,
// scoped to a single goal run.

const NIM_BASE = 'https://integrate.api.nvidia.com/v1'
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

// baseURL alongside the key getter — DeepSeek moved off NIM (persistently
// DEGRADED there) to OpenRouter; see src/lib/nim.ts for the same fix on the
// user-facing chat path. This route has its own small, self-contained
// MODEL_CONFIG (duplicated from nim.ts's PROVIDERS, not derived from it) so
// it needed the same baseURL correction independently.
const MODEL_CONFIG = {
  'deepseek/deepseek-v4-pro': { baseURL: OPENROUTER_BASE, getApiKey: () => process.env.DEEPSEEK_API_KEY ?? '' },
  'minimaxai/minimax-m3':           { baseURL: NIM_BASE, getApiKey: () => process.env.MINIMAX_API_KEY ?? '' },
  'qwen/qwen3.5-397b-a17b':      { baseURL: NIM_BASE, getApiKey: () => process.env.QWEN_API_KEY ?? '' },
  'z-ai/glm-5.2':                { baseURL: NIM_BASE, getApiKey: () => process.env.GLM_API_KEY ?? '' },
} as const

type AllowedModel = keyof typeof MODEL_CONFIG
const ALLOWED_MODELS = Object.keys(MODEL_CONFIG) as AllowedModel[]
const DEFAULT_MODEL: AllowedModel = 'deepseek/deepseek-v4-pro'

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export async function POST(req: Request) {
  const raw = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!raw) return Response.json({ error: 'Missing token' }, { status: 401 })
  const tokenHash = createHash('sha256').update(raw).digest('hex')

  const body = await req.json().catch(() => null)
  if (!body || typeof body.goal_run_id !== 'string' || !Array.isArray(body.messages)) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }
  const messages = (body.messages as ChatMessage[])
    .filter((m) => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role))
  if (messages.length === 0) return Response.json({ error: 'Bad request: no messages' }, { status: 400 })

  const { data: run } = await supabase
    .from('cruise_goal_runs')
    .select('id, token_hash, status, cap_steps, llm_calls_used')
    .eq('id', body.goal_run_id)
    .maybeSingle()
  // Constant-ish: same 401 whether the run is missing or the token is wrong.
  if (!run || run.token_hash !== tokenHash) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (run.llm_calls_used >= run.cap_steps) {
    return Response.json({ error: 'budget_exceeded', calls_used: run.llm_calls_used, cap_steps: run.cap_steps }, { status: 200 })
  }

  const selectedModel: AllowedModel = ALLOWED_MODELS.includes(body.model) ? body.model : DEFAULT_MODEL
  const { baseURL, getApiKey } = MODEL_CONFIG[selectedModel]
  const apiKey = getApiKey()
  if (!apiKey) return Response.json({ error: `No API key configured for ${selectedModel}` }, { status: 500 })

  // Reserve the slot before calling out — a slow or failing completion still
  // spends budget, so a stuck runner can't retry-loop past the cap.
  const nextCalls = run.llm_calls_used + 1
  await supabase.from('cruise_goal_runs').update({ llm_calls_used: nextCalls, heartbeat_at: new Date().toISOString() }).eq('id', run.id)

  try {
    const client = createOpenAI({ baseURL, apiKey })
    const result = await generateText({
      model: client.chat(selectedModel),
      messages,
      // A full file body can be large; the provider default can truncate mid-file
      // (finishReason 'length') and, worse, return empty text if all the budget
      // went to reasoning tokens. Give it real room and report finishReason so
      // the runner can tell "truncated / empty" apart from a normal answer.
      maxOutputTokens: 8192,
    })
    return Response.json({
      text: result.text ?? '',
      finish_reason: result.finishReason ?? null,
      calls_used: nextCalls,
      calls_remaining: run.cap_steps - nextCalls,
    })
  } catch (e) {
    return Response.json({ error: `LLM call failed: ${String(e)}`, calls_used: nextCalls, calls_remaining: run.cap_steps - nextCalls }, { status: 502 })
  }
}
