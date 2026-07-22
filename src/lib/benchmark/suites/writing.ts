import type { BenchmarkSuite } from '../types'

export const writingSuite: BenchmarkSuite = {
  id: 'writing',
  name: 'Writing',
  category: 'writing',
  weight: 4,
  cases: [
    {
      id: 'writing-transform',
      name: 'Transform tone',
      prompt: `Rewrite this sentence in a formal, professional tone: "Yo, we gotta ship this feature by Friday." Output only the rewritten sentence.`,
      evaluator: 'contains_all',
      expected: ['feature', 'Friday'],
    },
  ],
}
