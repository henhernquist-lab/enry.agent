import { z } from 'zod'
import type { BenchmarkSuite } from '../types'

export const toolCallingSuite: BenchmarkSuite = {
  id: 'tool-calling',
  name: 'Tool Calling',
  category: 'toolCalling',
  weight: 10,
  cases: [
    {
      id: 'tool-call-weather',
      name: 'Call weather tool',
      prompt: `What is the weather in San Francisco? Use the get_weather tool.`,
      tools: {
        get_weather: {
          description: 'Get the current weather for a city',
          parameters: z.object({
            city: z.string().describe('The city name'),
          }),
        },
      },
      evaluator: 'json_schema',
      expectedSchema: { city: 'San Francisco' },
    },
    {
      id: 'tool-call-calc',
      name: 'Call calculator tool',
      prompt: `What is 42 + 8? Use the calculate tool.`,
      tools: {
        calculate: {
          description: 'Perform a math calculation',
          parameters: z.object({
            expression: z.string().describe('The math expression to evaluate'),
          }),
        },
      },
      evaluator: 'json_schema',
      expectedSchema: { expression: '42 + 8' },
    },
  ],
}
