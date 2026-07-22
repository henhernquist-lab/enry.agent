import { NextRequest } from 'next/server'
import { benchmarkStorage } from '@/lib/benchmark/storage'
import { runBenchmark } from '@/lib/benchmark/runner'
import { ALL_SUITES } from '@/lib/benchmark/suites'
import { getAllBenchmarks, sortBenchmarks, type BenchmarkSortKey } from '@/lib/model-intelligence'

export const maxDuration = 10
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sort = searchParams.get('sort') as BenchmarkSortKey['id'] | null

  let benchmarks: ReturnType<typeof getAllBenchmarks> = []
  try {
    benchmarks = await benchmarkStorage.getLatestResults()
  } catch {
    benchmarks = []
  }
  if (benchmarks.length === 0) {
    benchmarks = getAllBenchmarks()
  }
  if (sort) {
    benchmarks = sortBenchmarks(benchmarks, sort)
  }

  return Response.json({ benchmarks })
}

export async function POST(req: NextRequest) {
  let body: { modelId?: string }
  try {
    body = (await req.json()) as { modelId?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { modelId } = body
  if (!modelId) {
    return Response.json({ error: 'modelId is required' }, { status: 400 })
  }

  // Detached background run — the HTTP response returns immediately.
  // In a serverless environment the process must complete before the
  // container is frozen; on long-running hosts this works as a true
  // background job. Future iteration can move this to a queue worker.
  runBenchmark({ modelId, suites: ALL_SUITES })
    .then((run) => benchmarkStorage.saveRun(run))
    .catch((err) => {
      console.error('[benchmark] run failed:', err)
    })

  return Response.json({ status: 'started', modelId }, { status: 202 })
}
