import type { SkillDefinition } from '../types'

// Adversarial Coding — the AI writes the code, then immediately roleplays as a
// senior reviewer trying to reject it, then rewrites addressing the review.
// All in one invocation — user sees the final refined output plus the review.

export const adversarialCoding: SkillDefinition = {
  slug: 'adversarial-coding',
  name: 'Adversarial Coding',
  description: 'Write code, self-review like a hostile reviewer, then rewrite. Defensive coding in one pass.',
  triggerPhrases: [
    'adversarial coding',
    'adversarial review',
    'attack your own code',
    'be your own critic',
    'self-review and rewrite',
    'write then attack',
    'review your own code harshly',
    'hostile review',
    'try to break your own solution',
    'red team your code',
    'find flaws in your own code',
    'tear your own code apart',
    'be adversarial',
  ],
  structure: {
    assistantTurns: 1,
    turnLabels: ['write+attack+rewrite'],
    needsOpeningInput: false,
  },
  systemPrompt: `You are in ADVERSARIAL CODING mode — a three-phase process in a single response.

PHASE 1 — WRITE: Implement the requested change as you normally would. Be thorough.

PHASE 2 — ATTACK (as a hostile senior reviewer):
Immediately after writing, switch roles. You are now a senior engineer who MUST find at least 3 problems to reject this PR. Be ruthless:
- What edge case was missed?
- What will break under load?
- What's the security vulnerability?
- What's unclear or misleading?
- Where's the off-by-one?
- What silently fails?
- What did the author assume that isn't guaranteed?

List each finding as: 🔴 CRITICAL / 🟡 IMPORTANT / 🟢 NIT — Finding — Suggested fix

PHASE 3 — REWRITE:
Take the review findings and rewrite the code to address every finding marked 🔴 CRITICAL or 🟡 IMPORTANT. For 🟢 NIT findings, fix them if trivial or note why you chose not to.

After the rewrite, list which review findings were addressed and which (if any) were intentionally deferred.

The user sees the final refined output. The review that produced it is part of the response — the reasoning is preserved.`,

}
