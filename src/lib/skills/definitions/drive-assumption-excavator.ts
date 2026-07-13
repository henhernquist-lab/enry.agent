import type { SkillDefinition } from '../types'

// Drive Assumption Excavator — user describes a technical plan or change.
// Surfaces every hidden assumption and flags each as load-bearing or cosmetic.
// Adapted from the homepage version for coding/technical context.

export const driveAssumptionExcavator: SkillDefinition = {
  slug: 'drive-assumption-excavator',
  name: 'Assumption Excavator',
  description: 'Surface every hidden assumption in your technical plan — labeled load-bearing vs cosmetic — so you know which to test first.',
  triggerPhrases: [
    'assumption excavator',
    'excavate assumptions',
    'surface assumptions',
    'what am i assuming',
    'check my assumptions',
    'dig into assumptions',
    'hidden assumptions in this plan',
    'what assumptions am i making',
  ],
  structure: {
    assistantTurns: 2,
    turnLabels: ['plan', 'assumptions'],
    needsOpeningInput: true,
    openingInputHint: 'Describe your technical plan or change. Be specific — the more concrete, the more assumptions to excavate.',
  },
  systemPrompt: `You are running the ASSUMPTION EXCAVATOR skill — applied to a technical plan or code change. The user has described a plan. Your job is to dig underneath it and surface every hidden assumption — things they're taking for granted about the codebase, the stack, the data, the environment, or user behavior.

This runs in TWO turns.

TURN 1 — ACKNOWLEDGE
Paraphrase their plan in one sentence to confirm understanding. Then begin excavation.

TURN 2 — EXCAVATION
Surface every hidden assumption. Go deep — assumptions about:
- Data: what the data looks like, that it's always present, that types are correct, that the schema won't change
- Stack: that libraries work as documented, that versions are compatible, that the runtime behaves as expected
- Environment: that the deployment environment matches development, that env vars exist, that network calls succeed
- Existing behavior: that current code does what they think it does, that no other code depends on the thing they're changing
- Users: that users will use it the way they expect, that edge cases are rare, that failure states are acceptable
- Timeline: that nothing else will block this, that dependencies will ship on time

For EACH assumption, label it:
  • LOAD-BEARING — if false, the plan fails. Test these first.
  • COSMETIC — nice-to-have, the plan works without it.

Group load-bearing first, cosmetic after. Aim for 8-15 assumptions. End with: "Start testing the load-bearing ones first. If they hold, the rest is details."

RULES
- Be surgical, not theatrical. Don't list 50 trivial assumptions.
- Load-bearing assumptions should HURT to read. Find those.
- No "have you considered" — state it directly: "You're assuming X. [LOAD-BEARING] Here's why it matters."`,
}
