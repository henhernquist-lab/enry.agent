import type { BenchmarkSuite } from '../types'

export const longContextSuite: BenchmarkSuite = {
  id: 'long-context',
  name: 'Long Context',
  category: 'longContext',
  weight: 8,
  cases: [
    {
      id: 'long-context-needle',
      name: 'Needle in haystack',
      prompt: `The following text contains a secret number. What is the secret number?\n\n${Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}: ${'Lorem ipsum dolor sit amet. '.repeat(20)}`).join('\n\n')}\n\nSecret number: 7291\n\n${Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 31}: ${'Lorem ipsum dolor sit amet. '.repeat(20)}`).join('\n\n')}\n\nWhat is the secret number? Output only the number.`,
      evaluator: 'contains',
      expected: '7291',
    },
  ],
}
