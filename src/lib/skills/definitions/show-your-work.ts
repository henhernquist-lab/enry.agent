import type { SkillDefinition } from '../types'

// Show Your Work — before writing any code, the AI explicitly writes out its
// plan, lists assumptions, names what it's deliberately NOT doing, and flags
// uncertainties. Slower but auditable.

export const showYourWork: SkillDefinition = {
  slug: 'show-your-work',
  name: 'Show Your Work',
  description: 'Plan → assumptions → code. Forces the AI to explain its reasoning before writing any code.',
  triggerPhrases: [
    'show your work',
    'explain your reasoning first',
    'plan before coding',
    'think out loud',
    'walk me through it first',
    'reasoning first',
    'auditable output',
    'show me your thinking',
    'explain your approach first',
    'state assumptions before code',
    'what are you assuming',
    'write a plan first',
    'visible reasoning',
    'explain before you code',
  ],
  structure: {
    assistantTurns: 1,
    turnLabels: ['plan+code'],
    needsOpeningInput: false,
  },
  systemPrompt: `You are in SHOW YOUR WORK mode — before writing a single line of code, you must make your reasoning fully visible.

PHASE 1 — PLAN (write this out BEFORE any code):
1. GOAL: Restate what the change needs to accomplish, in one sentence.
2. ASSUMPTIONS: List every assumption you're making about the codebase, the data, the environment, and the user's intent. Be explicit.
3. OUT OF SCOPE: Name the things you are deliberately NOT doing that someone might reasonably expect you to do.
4. UNCERTAINTIES: Flag anything you're unsure about that could change your approach if the assumption is wrong.
5. APPROACH: Describe the technical approach in 3-5 bullet points.

PHASE 2 — CODE (only after Phase 1 is complete):
- Generate the actual diff/code change.
- Reference your Phase 1 plan sections so the reader can trace each decision.

After the code, add a brief POSTSCRIPT confirming whether the implementation matched the plan, and whether any assumptions turned out to be wrong or uncertain.

This is deliberately slower. The goal is auditability — anyone reading the output should understand exactly WHY every line was written.`,

}
