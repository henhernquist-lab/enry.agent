import type { BenchmarkSuite } from '../types'

export const reasoningSuite: BenchmarkSuite = {
  id: 'reasoning',
  name: 'Reasoning',
  category: 'reasoning',
  weight: 20,
  cases: [
    {
      id: 'reasoning-scheduling',
      name: 'Schedule conflict',
      prompt: `Alice can meet Tuesday or Thursday after 2pm. Bob can meet Wednesday or Thursday before 3pm. Charlie can meet Tuesday or Friday. Find a time all three can meet. Output only the day.`,
      evaluator: 'contains',
      expected: 'Thursday',
    },
    {
      id: 'reasoning-logic',
      name: 'Logic puzzle',
      prompt: `Three boxes are labeled APPLES, ORANGES, and APPLES_ORANGES but all labels are wrong. You draw a fruit from the box labeled APPLES_ORANGES and it is an orange. What is the correct label for that box? Output only the label.`,
      evaluator: 'contains',
      expected: 'ORANGES',
    },
  ],
}
