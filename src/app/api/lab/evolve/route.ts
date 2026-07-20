import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { insertEvolutionRun, updateEvolutionRun } from '@/lib/lab/db'
import { generateText } from 'ai'
import { nimClientFor, parseJsonLoose } from '@/lib/nim'
import type { EvolutionCandidate } from '@/lib/lab/types'

export const maxDuration = 120

// Three models used for the evolutionary fan-out. DeepSeek is the default
// and strongest; MiniMax and Qwen provide alternative solution perspectives.
const EVOLVE_MODELS = [
  { id: 'deepseek/deepseek-v4-pro',    label: 'DeepSeek V4 Pro' },
  { id: 'minimaxai/minimax-m3',              label: 'MiniMax M3' },
  { id: 'qwen/qwen3.5-397b-a17b',          label: 'Qwen 3.5 397B' },
] as const

const SYNTHESIS_MODEL = 'deepseek/deepseek-v4-pro'
const SYNTHESIS_THRESHOLD = 0.85
const MIN_OUTPUT_LENGTH = 50

const REFUSAL_SIGNATURES = [
  'i cannot', 'i can\'t', 'i am unable', 'i apologize', 'i\'m sorry',
  'as an ai', 'not able to', 'cannot provide', 'unable to assist',
]

// ── Levenshtein distance ─────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const prev = new Uint16Array(n + 1)
  const curr = new Uint16Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      )
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return curr[n]
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

// ── Baseline gate ────────────────────────────────────────────

function passesGate(output: string): { ok: boolean; reason?: string } {
  if (!output || output.trim().length < MIN_OUTPUT_LENGTH) {
    return { ok: false, reason: 'Output too short or empty' }
  }

  const lower = output.toLowerCase()
  for (const sig of REFUSAL_SIGNATURES) {
    if (lower.startsWith(sig) && output.length < 300) {
      return { ok: false, reason: `Refusal detected: starts with "${sig}"` }
    }
  }

  return { ok: true }
}

// ── Candidate generation ─────────────────────────────────────

async function generateCandidate(
  modelId: string,
  modelLabel: string,
  prompt: string,
): Promise<EvolutionCandidate> {
  try {
    const client = nimClientFor(modelId)
    const { text } = await generateText({
      model: client.chat(modelId),
      system: `You are a coding agent. Given a problem description, produce a complete, working solution. Output ONLY the code with a brief explanation — no markdown fences, no JSON. If the task is a code change, use this exact format:

===FILE: <path>===
<the complete file content>
===ENDFILE===
===NOTE: <one-line summary>===

If the task is a new feature, output the full implementation. Be thorough — handle edge cases, add error handling, include necessary imports.`,
      prompt,
      temperature: 0.7,
      maxOutputTokens: 4000,
      timeout: 90_000,
      maxRetries: 1,
    })

    const trimmed = text.trim()
    if (!trimmed) {
      return { model: modelId, model_label: modelLabel, output: '', status: 'empty' }
    }

    const gate = passesGate(trimmed)
    if (!gate.ok) {
      return { model: modelId, model_label: modelLabel, output: trimmed, status: 'refused', error: gate.reason }
    }

    return { model: modelId, model_label: modelLabel, output: trimmed, status: 'ok' }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    const isTimeout = detail.includes('timeout') || detail.includes('timed out')
    return {
      model: modelId,
      model_label: modelLabel,
      output: '',
      status: isTimeout ? 'timeout' : 'error',
      error: detail,
    }
  }
}

// ── Judge synthesis ──────────────────────────────────────────

interface SynthesisResult {
  hybrid_code: string
  trait_breakdown: Record<string, string>
  reasoning: string
}

async function synthesize(candidates: EvolutionCandidate[], prompt: string): Promise<SynthesisResult | null> {
  const candidatesText = candidates
    .map((c, i) => `--- Candidate ${i + 1}: ${c.model_label} ---\n${c.output.slice(0, 3000)}`)
    .join('\n\n')

  const synthesisPrompt = `You are a code synthesis judge. Given ${candidates.length} independent solutions to the same problem, produce a hybrid that combines the best specific traits from each.

Problem:
${prompt}

Candidate solutions:
${candidatesText}

Your task:
1. For EACH candidate, identify ONE specific, named trait that it does better than the others. Be specific — "better error handling" is vague; "null-check on line 15 before accessing user.email" is specific.
2. Produce a hybrid solution that genuinely combines these traits into a single, coherent implementation. The hybrid should NOT be identical to any single candidate — it should visibly draw from at least two.
3. Output ONLY valid JSON in this exact shape (no markdown fences, no extra text):

{
  "hybrid_code": "the complete hybrid implementation",
  "trait_breakdown": {
    "DeepSeek V4 Pro": "specific trait from that candidate",
    "MiniMax M3": "specific trait from that candidate",
    "Qwen 3.5 397B": "specific trait from that candidate"
  },
  "reasoning": "2-3 sentences explaining the synthesis choices"
}

IMPORTANT: The hybrid_code must be complete, runnable code — not a summary or outline. Traits must be concrete, not generic.`

  try {
    const client = nimClientFor(SYNTHESIS_MODEL)
    const { text } = await generateText({
      model: client.chat(SYNTHESIS_MODEL),
      system: 'You are a precise code synthesis judge. Output only valid JSON — no markdown, no preamble.',
      prompt: synthesisPrompt,
      temperature: 0.5,
      maxOutputTokens: 5000,
      timeout: 90_000,
      maxRetries: 1,
    })

    const parsed = parseJsonLoose<SynthesisResult>(text)
    if (!parsed || !parsed.hybrid_code || !parsed.trait_breakdown) {
      console.error('[lab/evolve] judge returned unparseable output:', text.slice(0, 300))
      return null
    }

    return parsed
  } catch (err) {
    console.error('[lab/evolve] synthesis failed:', err)
    return null
  }
}

// ── Route handler ────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return Response.json({ error: 'prompt is required' }, { status: 400 })
  }

  const runId = await insertEvolutionRun(uid, prompt)
  if (!runId) {
    return Response.json({ error: 'Failed to create evolution run' }, { status: 500 })
  }

  const startedAt = Date.now()

  // Step 1: Fan out to all 3 models in parallel.
  const results = await Promise.allSettled(
    EVOLVE_MODELS.map((m) => generateCandidate(m.id, m.label, prompt)),
  )

  const candidates: EvolutionCandidate[] = results.map((r) => {
    if (r.status === 'fulfilled') return r.value
    return {
      model: 'unknown',
      model_label: 'Unknown',
      output: '',
      status: 'error',
      error: r.reason?.message ?? 'Promise rejected',
    }
  })

  // Step 2: Baseline gate — filter to candidates that passed.
  const surviving = candidates.filter((c) => c.status === 'ok')

  // Step 3: Determine outcome based on survivor count.
  if (surviving.length === 0) {
    const runTime = Date.now() - startedAt
    await updateEvolutionRun(runId, {
      status: 'all_failed',
      candidates,
      run_time_ms: runTime,
    })
    return Response.json({
      run: {
        id: runId,
        status: 'all_failed',
        candidates,
        hybrid_output: null,
        hybrid_genuine: null,
        run_time_ms: runTime,
      },
    })
  }

  if (surviving.length === 1) {
    // Can't synthesize from a single candidate — present it directly.
    const runTime = Date.now() - startedAt
    await updateEvolutionRun(runId, {
      status: 'completed',
      candidates,
      hybrid_output: surviving[0].output,
      trait_breakdown: { [surviving[0].model_label]: 'Only viable candidate' },
      hybrid_genuine: true,
      run_time_ms: runTime,
    })
    return Response.json({
      run: {
        id: runId,
        status: 'completed',
        candidates,
        hybrid_output: surviving[0].output,
        hybrid_genuine: true,
        run_time_ms: runTime,
      },
    })
  }

  // Step 4: Run judge synthesis on surviving candidates.
  const synthesis = await synthesize(surviving, prompt)

  if (!synthesis) {
    const runTime = Date.now() - startedAt
    await updateEvolutionRun(runId, {
      status: 'error',
      candidates,
      error: 'Judge synthesis failed — could not parse judge output',
      run_time_ms: runTime,
    })
    return Response.json({
      run: {
        id: runId,
        status: 'error',
        candidates,
        error: 'Judge synthesis failed',
        run_time_ms: runTime,
      },
    })
  }

  // Step 5: Levenshtein similarity check — is the hybrid genuine?
  const similarityScores: Record<string, number> = {}
  let maxSimilarity = 0
  for (const c of surviving) {
    const sim = similarity(synthesis.hybrid_code, c.output)
    similarityScores[c.model_label] = Math.round(sim * 100) / 100
    if (sim > maxSimilarity) maxSimilarity = sim
  }

  const hybridGenuine = maxSimilarity < SYNTHESIS_THRESHOLD
  const runTime = Date.now() - startedAt

  await updateEvolutionRun(runId, {
    status: hybridGenuine ? 'completed' : 'degenerate',
    candidates,
    hybrid_output: synthesis.hybrid_code,
    trait_breakdown: synthesis.trait_breakdown,
    similarity_scores: similarityScores,
    hybrid_genuine: hybridGenuine,
    run_time_ms: runTime,
  })

  return Response.json({
    run: {
      id: runId,
      status: hybridGenuine ? 'completed' : 'degenerate',
      candidates,
      hybrid_output: synthesis.hybrid_code,
      trait_breakdown: synthesis.trait_breakdown,
      similarity_scores: similarityScores,
      hybrid_genuine: hybridGenuine,
      reasoning: synthesis.reasoning,
      run_time_ms: runTime,
    },
  })
}
