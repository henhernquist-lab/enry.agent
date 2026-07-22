import type { BenchmarkSuite } from '../types'

export const instructionFollowingSuite: BenchmarkSuite = {
  id: 'instruction-following',
  name: 'Instruction Following',
  category: 'instructionFollowing',
  weight: 8,
  cases: [
    {
      id: 'instruction-format',
      name: 'Follow output format',
      prompt: `Reply with exactly two words in this format: "Color: <color>". The color should be red. Do not include anything else.`,
      evaluator: 'contains',
      expected: 'Color: red',
    },
  ],
}
