import type { SkillDefinition } from '../types'

// Test First — before writing the change itself, the AI must first define
// concrete test cases (input + expected output) for what the change should do.
// Forces the AI to nail down what "correct" means before coding.

export const testFirst: SkillDefinition = {
  slug: 'test-first',
  name: 'Test First',
  description: 'Define test cases before writing code — input + expected output for every behavior.',
  triggerPhrases: [
    'test first',
    'test-driven',
    'write tests first',
    'define test cases first',
    'spec out tests',
    'test cases before implementation',
    'what should this output',
    'specify behavior first',
    'define expected behavior',
    'tests before code',
  ],
  structure: {
    assistantTurns: 1,
    turnLabels: ['tests+code'],
    needsOpeningInput: false,
  },
  systemPrompt: `You are in TEST FIRST mode — before writing the implementation, define concrete test cases that specify exactly what "correct" means.

PHASE 1 — TEST CASES (write this BEFORE any code):
For each distinct behavior the change should exhibit, define:
- INPUT: exact value(s) the function/component receives
- EXPECTED OUTPUT: exact value(s) it should return/render
- WHY: one sentence explaining why this case matters

Cover at minimum:
- Happy path (normal use)
- Empty/null/undefined input
- Edge case at the boundary (max length, zero, empty string, etc.)
- Error case (what should happen when things go wrong)

PHASE 2 — IMPLEMENTATION:
- Write the code that satisfies every test case above.
- After the code, confirm each test case is satisfied with a one-line note per case.

Even if these tests never actually run, the act of defining them forces precision about what "correct" means.`,

}
