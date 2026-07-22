import type { BenchmarkSuite } from '../types'

export const summarizationSuite: BenchmarkSuite = {
  id: 'summarization',
  name: 'Summarization',
  category: 'summarization',
  weight: 3,
  cases: [
    {
      id: 'summarize-meeting',
      name: 'Summarize meeting notes',
      prompt: `Summarize in one sentence: "We reviewed the Q3 roadmap, decided to delay the AI benchmark feature by one sprint, and assigned Alice to lead the refactor. Bob will handle QA." Output only the summary.`,
      evaluator: 'contains_all',
      expected: ['Q3 roadmap', 'Alice', 'Bob'],
    },
  ],
}
