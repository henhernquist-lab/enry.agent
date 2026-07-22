import type { BenchmarkSuite } from '../types'

export const codingSuite: BenchmarkSuite = {
  id: 'coding',
  name: 'Coding',
  category: 'coding',
  weight: 20,
  cases: [
    {
      id: 'coding-react-counter',
      name: 'Build a React counter',
      prompt: `Write a React component called Counter that shows a number and has + and - buttons. Use TypeScript. Output only the code.`,
      evaluator: 'contains_all',
      expected: ['useState', 'Counter', 'onClick'],
    },
    {
      id: 'coding-ts-bug',
      name: 'Fix a TypeScript bug',
      prompt: `This function has a bug. Return only the corrected function.\n\nfunction greet(name: string) {\n  return \"Hello, \" + name.trim();\n}\n\nFix it so it handles null/undefined safely.`,
      evaluator: 'contains',
      expected: 'null',
    },
    {
      id: 'coding-sql-select',
      name: 'Write SQL',
      prompt: `Write a SQL query that returns the top 10 users by total_order_value from an orders table. Output only the query.`,
      evaluator: 'contains_all',
      expected: ['SELECT', 'ORDER BY', 'LIMIT 10'],
    },
  ],
}
