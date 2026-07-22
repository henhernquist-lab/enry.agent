import type { BenchmarkSuite } from '../types'

export const jsonStructuredSuite: BenchmarkSuite = {
  id: 'json-structured',
  name: 'JSON / Structured Output',
  category: 'jsonStructured',
  weight: 10,
  cases: [
    {
      id: 'json-extract',
      name: 'Extract entities as JSON',
      prompt: `Extract the name, age, and city from this text and return only JSON with keys "name", "age", "city".\n\n"Alice is 30 years old and lives in Seattle."`,
      evaluator: 'json_schema',
      expectedSchema: { name: 'Alice', age: 30, city: 'Seattle' },
    },
  ],
}
