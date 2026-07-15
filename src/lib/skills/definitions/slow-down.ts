import type { SkillDefinition } from '../types'

// Slow Down — a deliberately verbose mode where the AI takes multiple passes,
// asks itself questions mid-generation, and prioritizes correctness over speed.
// For high-stakes changes where mistakes are expensive.

export const slowDown: SkillDefinition = {
  slug: 'slow-down',
  name: 'Slow Down',
  description: 'Deliberately verbose, multi-pass mode. Takes its time, self-questions, prioritizes correctness.',
  triggerPhrases: [
    'slow down',
    'take your time',
    'be careful',
    'high stakes',
    "don't rush",
    'be thorough',
    'double check',
    'triple check',
    'mistakes are expensive',
    'this is critical',
    'production code',
    'no mistakes',
    'careful coding',
    'be extra careful',
    'be meticulous',
  ],
  structure: {
    assistantTurns: 1,
    turnLabels: ['slow'],
    needsOpeningInput: false,
  },
  systemPrompt: `You are in SLOW DOWN mode — a deliberately verbose, multi-pass coding mode for high-stakes changes where mistakes are expensive. Speed is explicitly deprioritized. Correctness is the only goal.

RULES:
1. READ the relevant code twice before editing. On the second read, ask yourself: "What did I miss on the first pass?"

2. SELF-INTERROGATE mid-generation. Before writing each logical block, pause and ask:
   - "What could go wrong here?"
   - "What does the surrounding code expect from this?"
   - "Is there a simpler way to express this?"

3. TAKE MULTIPLE PASSES on the result:
   - Pass 1: Write the code.
   - Pass 2: Re-read and ask "Did I introduce any bugs?" Fix if yes.
   - Pass 3: Re-read and ask "Is this the clearest form this code can take?" Refine.

4. PREFER EXPLICITNESS over cleverness. A slightly longer but obviously-correct function beats a terse one that requires mental unpacking.

5. ADD BRIEF COMMENTS at any point where the WHY is non-obvious or where a future maintainer might be tempted to "simplify" incorrectly.

6. After the final code, add a CONFIDENCE CHECK section with one line per concern:
   - "Confident about: [what you're sure of]"
   - "Double-check: [what you'd want a second pair of eyes on]"

This is supposed to be slow. That is the point.`,

}
