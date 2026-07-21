/**
 * /api/diag/test-model — dev-only diagnostic endpoint that fires one short
 * generation against a registered model to confirm the provider client is
 * wired up. Used to verify new models end-to-end without touching a real
 * chat session.
 *
 * Body: { model?: string, prompt?: string }
 *   - If `model` is omitted, runs the test against every entry in MODEL_LIST
 *     and returns a per-model result so one call proves all providers work.
 *   - `prompt` defaults to a tiny "say 'pong' and nothing else" to keep the
 *     call under a few hundred tokens.
 *
 * Auth: requires an authenticated session (NextAuth). The dev's owner
 * profile is the typical caller — anyone else gets a 401.
 */

import { auth } from '@/lib/auth'
import { generateText } from 'ai'
import {
  MODEL_LIST,
  getChatModel,
  getModelMeta,
  isModelConfigured,
} from '@/lib/nim'

const DEFAULT_PROMPT = "Reply with the single word 'pong' and nothing else. No punctuation, no commentary."

interface ModelTestResult {
  model: string
  label: string
  scope: 'chat' | 'drive' | 'lite' | 'unknown'
  ok: boolean
  text?: string
  durationMs: number
  error?: string
  configured: boolean
  missingEnvVar?: string
}

async function testSingleModel(id: string): Promise<ModelTestResult> {
  const meta = getModelMeta(id)
  const start = Date.now()
  const base: ModelTestResult = {
    model: id,
    label: meta?.label ?? id,
    scope: meta?.scopes?.[0] ?? 'unknown',
    ok: false,
    durationMs: 0,
    configured: isModelConfigured(id),
  }
  if (!base.configured) {
    base.durationMs = Date.now() - start
    base.error = 'No API key configured for this model on the server.'
    base.missingEnvVar = inferEnvVarName(id)
    return base
  }
  if (!meta) {
    base.durationMs = Date.now() - start
    base.error = 'Model id is not registered in MODEL_LIST.'
    return base
  }

  try {
    const { text } = await generateText({
      model: getChatModel(id),
      prompt: DEFAULT_PROMPT,
      maxOutputTokens: 32,
      temperature: 0,
      timeout: 30_000,
      maxRetries: 0,
    })
    return {
      ...base,
      durationMs: Date.now() - start,
      ok: true,
      text,
    }
  } catch (err) {
    return {
      ...base,
      durationMs: Date.now() - start,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function inferEnvVarName(modelId: string): string {
  if (modelId === 'gemini-3.5-flash') return 'GEMINI_API_KEY'
  if (modelId === 'gpt-4o') return 'GITHUB_MODELS_API_KEY (or GITHUB_TOKEN)'
  if (modelId.startsWith('moonshotai/kimi-k2.7-code') || modelId.includes('kimi-k2.7-code')) return 'OPENROUTER_API_KEY'
  if (modelId.startsWith('deepseek')) return 'DEEPSEEK_API_KEY'
  if (modelId.startsWith('minimax')) return 'MINIMAX_API_KEY'
  if (modelId.startsWith('qwen')) return 'QWEN_API_KEY'
  if (modelId.startsWith('z-ai')) return 'GLM_API_KEY'
  if (modelId.startsWith('nvidia/')) return 'NVIDIA_API_KEY'
  if (modelId.startsWith('moonshotai/')) return 'MOONSHOT_API_KEY'
  return `<unknown env for ${modelId}>`
}

export async function POST(req: Request) {
  // Auth gate — diagnostic routes aren't free-for-all. Any signed-in user
  // can hit them, but unauthenticated callers get 401.
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Sign in to run model diagnostics.' }, { status: 401 })
  }

  let body: { model?: string } = {}
  try {
    body = await req.json().catch(() => ({}))
  } catch {
    /* empty body is fine */
  }

  // Default mode: test every model in the registry (parallel where possible).
  // Single-mode: test only the requested id.
  const targets = body.model ? [body.model] : MODEL_LIST.map((m) => m.id)

  const results = await Promise.all(targets.map((id) => testSingleModel(id)))

  return Response.json({
    timestamp: new Date().toISOString(),
    requested: body.model ?? 'all',
    count: results.length,
    results,
  })
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Sign in to run model diagnostics.' }, { status: 401 })
  }
  return Response.json({
    route: '/api/diag/test-model',
    method: 'POST',
    body: '{ model?: string }',
    note: 'POST to run. Omit `model` to test every registered model in parallel.',
    registered_models: MODEL_LIST.map((m) => ({ id: m.id, label: m.label, scopes: m.scopes })),
  })
}
