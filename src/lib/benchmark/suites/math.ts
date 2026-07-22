import type { BenchmarkSuite } from '../types'

export const mathSuite: BenchmarkSuite = {
  id: 'math',
  name: 'Math',
  category: 'math',
  weight: 5,
  cases: [
    {
      id: 'math-linear',
      name: 'Solve linear equation',
      prompt: `Solve for x: 3x + 7 = 22. Output only the numeric value of x.`,
      evaluator: 'contains',
      expected: '5',
    },
    {
      id: 'math-percentage',
      name: 'Percentage discount',
      prompt: `A $120 jacket is discounted by 25%. What is the final price? Output only the final price with a $ sign.`,
      evaluator: 'contains',
      expected: '$90',
    },
  ],
}
