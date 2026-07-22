import { getAllBenchmarks, sortBenchmarks, type BenchmarkSortKey } from '@/lib/model-intelligence'

export const maxDuration = 10

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sort = searchParams.get('sort') as BenchmarkSortKey['id'] | null

  let benchmarks = getAllBenchmarks()
  if (sort) {
    benchmarks = sortBenchmarks(benchmarks, sort)
  }

  return Response.json({ benchmarks })
}
