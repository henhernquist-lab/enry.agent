import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { MODEL_LIST, isModelConfigured } from '@/lib/nim'
import {
  startBenchmarkRun,
  recordProgress,
  completeBenchmarkRun,
  failBenchmarkRun,
  getLatestResults,
} from '@/lib/benchmark/storage'
import { runBenchmark } from '@/lib/benchmark/runner'
import { ALL_SUITES } from '@/lib/benchmark/suites'
import { sortBenchmarks, type BenchmarkSortKey } from '@/lib/model-intelligence'

// A full run makes many real model calls across suites; it must survive past
// the HTTP response, so the work is scheduled via after() and bounded by this.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function requireUser(): Promise<string | null> {
  const session = await auth()
  const googleId = (session?.user as { id?: string } | undefined)?.id ?? null
  return resolveResourceUserId(googleId)
}

export async function GET(req: NextRequest) {
  const uid = await requireUser()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const sort = searchParams.get('sort') as BenchmarkSortKey['id'] | null

  // Real completed runs only. A model with no completed run simply isn't in
  // the list — an empty array is honest, never a fabricated static fallback.
  let benchmarks = await getLatestResults(uid)
  if (sort) benchmarks = sortBenchmarks(benchmarks, sort)

  return Response.json({ benchmarks })
}

export async function POST(req: NextRequest) {
  const uid = await requireUser()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { modelId?: string }
  try {
    body = (await req.json()) as { modelId?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { modelId } = body
  if (!modelId) return Response.json({ error: 'modelId is required' }, { status: 400 })
  if (!MODEL_LIST.some((m) => m.id === modelId)) {
    return Response.json({ error: `Unknown model: ${modelId}` }, { status: 400 })
  }
  if (!isModelConfigured(modelId)) {
    return Response.json({ error: `Model ${modelId} is not configured with an API key` }, { status: 400 })
  }

  // Insert first so the client has a runId to poll immediately; the actual
  // work runs in after(), which keeps the serverless container alive past the
  // response (up to maxDuration) instead of a fire-and-forget that dies on freeze.
  const runId = await startBenchmarkRun(uid, modelId)

  after(async () => {
    try {
      const run = await runBenchmark({
        modelId,
        suites: ALL_SUITES,
        onProgress: (payload) => {
          // Best-effort tick; a dropped update just means a slightly stale bar.
          void recordProgress(runId, payload)
        },
      })
      await completeBenchmarkRun(runId, run)
    } catch (err) {
      await failBenchmarkRun(runId, err instanceof Error ? err.message : String(err))
    }
  })

  return Response.json({ runId, modelId, status: 'running' }, { status: 202 })
}
