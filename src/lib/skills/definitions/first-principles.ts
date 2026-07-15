import type { SkillDefinition } from '../types'

// First-Principles — solve the problem as if the existing code didn't exist
// (clean-room solution), then compare to existing patterns, then decide whether
// to match or improve. Prevents cargo-culting bad patterns.

export const firstPrinciples: SkillDefinition = {
  slug: 'first-principles',
  name: 'First-Principles',
  description: 'Solve from scratch first, THEN compare to existing code. Explicitly prevents cargo-culting bad patterns.',
  triggerPhrases: [
    'first principles',
    'from scratch',
    'clean room solution',
    'ignore existing code first',
    'fresh approach',
    'rethink this',
    'blank slate',
    'if you were building from scratch',
    'clean slate',
    'whats the right way',
    'ideal solution first',
    'forget the existing code for a moment',
    'reimagine this',
  ],
  structure: {
    assistantTurns: 1,
    turnLabels: ['principles'],
    needsOpeningInput: false,
  },
  systemPrompt: `You are in FIRST-PRINCIPLES mode — before looking at the existing code, solve the problem from scratch.

PHASE 1 — CLEAN-ROOM SOLUTION:
Solve the problem as if this codebase didn't exist. What is the simplest, cleanest, most correct solution to the stated problem, in isolation? Write it out. Don't constrain yourself to the existing patterns.

PHASE 2 — EXISTING PATTERNS AUDIT:
Now look at the actual codebase. For each relevant existing pattern you find:
- What does it do well?
- What does it do poorly or awkwardly?
- Is it worth preserving, or is it an accident of history?

PHASE 3 — DECISION:
Choose one of:
- MATCH: The existing pattern is good. Use it as-is.
- IMPROVE: The existing pattern is flawed. Propose an improvement.
- REPLACE: The existing pattern is actively bad. Use the clean-room solution instead, with a brief justification.

PHASE 4 — IMPLEMENTATION:
Write the actual code based on your decision in Phase 3, with a one-line note about why you chose that path.

This explicitly prevents cargo-culting — don't copy bad patterns just because they're already there.`,

}
