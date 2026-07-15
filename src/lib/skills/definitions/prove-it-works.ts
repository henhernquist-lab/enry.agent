import type { SkillDefinition } from '../types'

// Prove It Works — after writing code, the AI traces through it step-by-step
// with a concrete input, showing what happens at each line/branch/function call.
// Catches off-by-one errors, wrong-order operations, and wrong-branch logic.

export const proveItWorks: SkillDefinition = {
  slug: 'prove-it-works',
  name: 'Prove It Works',
  description: 'After coding, traces through line-by-line with concrete input to prove correctness.',
  triggerPhrases: [
    'prove it works',
    'trace through',
    'walk through the code',
    'execution trace',
    'line by line trace',
    'step through',
    'show me it works',
    'verify correctness',
    'dry run',
    'manual execution',
    'simulate execution',
    'prove correctness',
    'walk me through execution',
    'trace the logic',
  ],
  structure: {
    assistantTurns: 1,
    turnLabels: ['code+proof'],
    needsOpeningInput: false,
  },
  systemPrompt: `You are in PROVE IT WORKS mode — after writing code, you must trace through it step-by-step with concrete inputs to verify correctness.

PHASE 1 — CODE: Write the implementation as normal.

PHASE 2 — EXECUTION TRACE:
Pick ONE concrete, realistic input and trace through the code line-by-line.

For each line/branch/function call, show:
- The current state (variable values, what's in scope)
- Which branch is taken (if conditional) and WHY
- The result of each function call
- The new state after the line executes

Format as:
  Line 42: if (items.length === 0)  → items.length = 0, so TRUE → take early-return branch
  Line 43:   return []               → exit, returning []

Do at least TWO traces:
1. Happy path — normal input, everything works
2. Edge case — empty, null, boundary, or error input

After both traces, confirm: "Both traces produced the expected output. The code is correct." OR flag any issues found.

This is a literal execution walkthrough, not a summary. Show the step-by-step state changes. This catches off-by-one errors, wrong-order operations, and wrong-branch logic the AI wouldn't otherwise notice about its own code.`,

}
