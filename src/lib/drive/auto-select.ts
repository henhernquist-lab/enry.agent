import { listModels, type ModelMeta } from '@/lib/nim'
import type { ReasoningDepth } from '@/lib/reasoning-trace'

// Auto mode's task-assessment + model/effort/Think selection for Drive.
//
// Pure, synchronous, client-callable — runs BEFORE the model call starts, off
// signals already available at that point (the instruction text, and which
// skill — if any — the existing skill-detection logic already found for this
// request). No separate model-selection table: strength tiers are derived
// from ModelMeta fields (`supportsReasoning`, `defaultEffort`) that already
// exist in nim.ts for other purposes (picker labels, default-effort seeding),
// so adding/removing a model from the registry automatically reshapes Auto
// mode's choices without touching this file.

export type TaskComplexity = 'simple' | 'moderate' | 'complex'
export type DriveEffortId = 'none' | 'low' | 'medium' | 'high' | 'deep'

export interface AutoSelection {
  modelId: string
  modelLabel: string
  effort: DriveEffortId
  think: ReasoningDepth
  complexity: TaskComplexity
}

/** Minimal shape needed from a skill for classification. */
export interface SkillSignal {
  slug: string
}

// Keyword signals — deliberately coarse. This is a fast heuristic pass, not
// a model call: no added latency, no extra point of failure before the real
// request starts.
const COMPLEX_KEYWORDS = [
  'refactor', 'rewrite', 'redesign', 'migrate', 'migration', 'architecture',
  'restructure', 'overhaul', 'rearchitect', 'across the codebase',
  'entire codebase', 'multiple files', 'full audit', 'security review',
  'race condition', 'concurrency', 'end to end', 'end-to-end',
]
const SIMPLE_KEYWORDS = [
  'typo', 'rename', 'one line', 'one-line', 'quick fix', 'small change',
  'add a comment', 'tweak', 'small tweak', 'change the color', 'update the string',
]

// Skills that inherently imply heavier multi-angle analysis vs. skills that
// are lightweight/conversational by design — informs the score, doesn't
// replace the existing skill-detection mechanism (detectSkillInvocation),
// which decides WHICH skill fires in the first place.
const HEAVY_SKILLS = new Set([
  'architect', 'code-council', 'codebase-grounded', 'adversarial-coding',
  'two-model-consensus', 'first-principles',
])
const LIGHT_SKILLS = new Set(['rubber-duck', 'explainer', 'simplifier'])

export function classifyTaskComplexity(instruction: string, skill: SkillSignal | null): TaskComplexity {
  const text = instruction.toLowerCase()
  const wordCount = instruction.trim().split(/\s+/).filter(Boolean).length

  let score = 0
  for (const kw of COMPLEX_KEYWORDS) if (text.includes(kw)) score += 2
  for (const kw of SIMPLE_KEYWORDS) if (text.includes(kw)) score -= 2
  if (wordCount > 60) score += 2
  else if (wordCount <= 8) score -= 1

  if (skill) {
    if (HEAVY_SKILLS.has(skill.slug)) score += 3
    else if (LIGHT_SKILLS.has(skill.slug)) score -= 1
    else score += 1 // any other detected skill still signals real analytical work
  }

  if (score >= 3) return 'complex'
  if (score <= -2) return 'simple'
  return 'moderate'
}

/** Reasoning-capacity score derived purely from existing ModelMeta fields. */
function strengthScore(m: ModelMeta): number {
  return (m.supportsReasoning ? 2 : 0) + (m.defaultEffort === 'high' ? 2 : m.defaultEffort === 'medium' ? 1 : 0)
}

/**
 * Picks model + effort + Think depth for a given complexity tier from the
 * live `drive`-scope registry. Weakest/median/strongest by strengthScore;
 * ties resolve to whichever model is declared earliest in nim.ts's
 * MODEL_LIST (via Array.find), so the registry's own ordering — not an
 * arbitrary tiebreak — decides who wins a tie.
 */
export function autoSelectForComplexity(complexity: TaskComplexity): AutoSelection {
  const driveModels = listModels('drive')
  const scores = driveModels.map(strengthScore)

  let target: ModelMeta
  let effort: DriveEffortId
  let think: ReasoningDepth

  if (complexity === 'complex') {
    const maxScore = Math.max(...scores)
    target = driveModels.find((m) => strengthScore(m) === maxScore) ?? driveModels[0]
    effort = 'high'
    think = 'full'
  } else if (complexity === 'simple') {
    const minScore = Math.min(...scores)
    target = driveModels.find((m) => strengthScore(m) === minScore) ?? driveModels[0]
    effort = 'low'
    think = 'off'
  } else {
    const sortedScores = [...scores].sort((a, b) => a - b)
    const medianScore = sortedScores[Math.floor(sortedScores.length / 2)]
    target = driveModels.find((m) => strengthScore(m) === medianScore) ?? driveModels[0]
    effort = 'medium'
    think = 'summary'
  }

  return { modelId: target.id, modelLabel: target.label, effort, think, complexity }
}
