import type { SkillDefinition } from '../types'

// Two-Model Consensus — runs through two different Enry Engine models
// independently, then compares outputs. If they agree, flags high confidence.
// If they disagree, shows both side-by-side. Defense against confident wrongness.
//
// NOTE: This skill's system prompt describes the multi-model behavior, but the
// actual two-model execution is handled at the client level in page.tsx. When
// this skill is active, the client fires two parallel exec() calls with
// different models, then renders the comparison UI. The system prompt below
// tells each model it's one half of a consensus check.

export const twoModelConsensus: SkillDefinition = {
  slug: 'two-model-consensus',
  name: 'Two-Model Consensus',
  description: 'Runs through two Enry Engine models independently, compares outputs. Defense against confident wrongness.',
  triggerPhrases: [
    'two model consensus',
    'two-model consensus',
    'dual model',
    'multi model check',
    'second opinion',
    'cross-check with another model',
    'use two models',
    'model consensus',
    'get a second model opinion',
    'compare model outputs',
    'double model',
    'two models please',
    'consensus check',
  ],
  structure: {
    assistantTurns: 1,
    turnLabels: ['consensus'],
    needsOpeningInput: false,
  },
  systemPrompt: `You are operating in TWO-MODEL CONSENSUS mode. Your output will be compared against another Enry Engine model's output for the same request. Both models receive the same input independently.

RULES:
1. Produce your BEST answer. Don't hedge or be vague — the comparison needs clear, concrete code to evaluate.
2. Be thorough. Missing details that the other model catches will be flagged as disagreements.
3. If you're uncertain about something, state it explicitly. Uncertainty is better communicated than hidden.
4. This is a defense against confident wrongness: the other model may catch errors you miss. Your job is to minimize those errors.

FORMAT:
- Start with "MODEL: [state which model you are — DeepSeek V4 Pro, MiniMax M3, Qwen 3.5 122B, GLM 5.2, or Nemotron 3 Ultra]"
- Then produce your complete response (plan, code, explanation) as normal.

Your output will be paired with another model's output. If both models substantively agree, the user sees the agreed solution flagged "HIGH CONFIDENCE — both agreed." If they differ, the user sees both side-by-side to decide manually.`,

}
