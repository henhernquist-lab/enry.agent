import type { SkillDefinition } from './types'
import { devilAdvocate } from './definitions/devil-advocate'
import { steelmanDrill } from './definitions/steelman-drill'
import { fifthGrader } from './definitions/fifth-grader'
import { attentionAudit } from './definitions/attention-audit'
import { askTheCouncil } from './definitions/ask-the-council'
import { assumptionExcavator } from './definitions/assumption-excavator'
import { preMortem } from './definitions/pre-mortem'
import { socraticMode } from './definitions/socratic-mode'
import { eliExpert } from './definitions/eli-expert'
import { secondOrderSimulator } from './definitions/second-order-simulator'
import { interrogator } from './definitions/interrogator'
import { distiller } from './definitions/distiller'
import { tenTenTen } from './definitions/ten-ten-ten'
import { feynman } from './definitions/feynman'
import { editor } from './definitions/editor'
import { voiceMatch } from './definitions/voice-match'
import { antiCliché } from './definitions/anti-cliche'
import { envyCompass } from './definitions/envy-compass'
// Drive (coding-focused) skills
import { cartographer } from './definitions/cartographer'
import { ghostHunter } from './definitions/ghost-hunter'
import { bisector } from './definitions/bisector'
import { buildVsBuyVsSkip } from './definitions/build-vs-buy-vs-skip'
import { estimator } from './definitions/estimator'
import { scopeCutter } from './definitions/scope-cutter'
import { failureModeMapper } from './definitions/failure-mode-mapper'

// The registry. Adding a skill = import its definition and add it to this
// array. Everything else (invocation, banner, round-tracking, exit, the
// skill-aware system prompt on the server) reads from these declarations —
// no per-skill code anywhere else.
export const SKILLS: SkillDefinition[] = [
  // Chat skills
  devilAdvocate,
  steelmanDrill,
  fifthGrader,
  attentionAudit,
  askTheCouncil,
  assumptionExcavator,
  preMortem,
  socraticMode,
  eliExpert,
  secondOrderSimulator,
  interrogator,
  distiller,
  tenTenTen,
  feynman,
  editor,
  voiceMatch,
  antiCliché,
  envyCompass,
  // Drive (coding-focused) skills
  cartographer,
  ghostHunter,
  bisector,
  buildVsBuyVsSkip,
  estimator,
  scopeCutter,
  failureModeMapper,
]

export function getSkill(slug: string): SkillDefinition | undefined {
  return SKILLS.find((s) => s.slug === slug)
}

export function getSkills(slugs: string[]): SkillDefinition[] {
  return slugs.map((s) => getSkill(s)).filter((s): s is SkillDefinition => s !== undefined)
}

// Normalize for fuzzy matching: lowercase, strip apostrophes (so "devil's" and
// "devils" match), collapse whitespace.
function normalize(s: string): string {
  return s.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim()
}

export interface SkillInvocation {
  skill: SkillDefinition
  // The topic/belief the user supplied inline, if any. Empty string means the
  // skill was invoked bare and (if it needsOpeningInput) should wait for the
  // user's next message.
  topic: string
  // How it was triggered — surfaced so the UI can differentiate if it wants.
  via: 'command' | 'phrase'
}

// Detects whether a raw chat input is invoking a skill. Two paths:
//   (a) explicit command:  /skill <slug> [topic]
//   (b) natural language:   any registered trigger phrase, e.g.
//       "run devil's advocate on my plan to cut sleep" → topic after the phrase.
// Returns null when the input is just normal chat.
// For multi-skill support, use detectSkillInvocations() instead.
export function detectSkillInvocation(raw: string): SkillInvocation | null {
  const trimmed = raw.trim()

  // (a) Explicit command.
  const cmd = trimmed.match(/^\/skill\s+([\w-]+)\s*([\s\S]*)$/i)
  if (cmd) {
    const skill = getSkill(cmd[1].toLowerCase())
    if (!skill) return null
    return { skill, topic: cmd[2].trim(), via: 'command' }
  }

  // (b) Natural-language trigger phrase.
  const norm = normalize(trimmed)
  for (const skill of SKILLS) {
    for (const phrase of skill.triggerPhrases) {
      const np = normalize(phrase)
      const idx = norm.indexOf(np)
      if (idx === -1) continue
      // Require the phrase to sit on a word boundary — avoids matching a phrase
      // buried inside a larger unrelated word.
      const before = idx === 0 ? ' ' : norm[idx - 1]
      const after = norm[idx + np.length]
      const isAfterBoundary = after === undefined || after === ' ' || /[:,.;?!\-]/.test(after)
      if (before !== ' ' || !isAfterBoundary) continue
      return { skill, topic: extractTopic(trimmed, phrase), via: 'phrase' }
    }
  }

  return null
}

// Multi-skill version: detects whether a raw input invokes 1+ skills.
// Supports:
//   (a) /skill slug1 slug2 slug3 [topic]  — explicit multi-skill
//   (b) /skill slug [topic]               — explicit single (backward compat)
//   (c) natural language phrases          — single skill only (for simplicity)
//
// Cap max 4 skills to avoid token-blowout and unreadable output walls.
const MAX_MULTI_SKILLS = 4

export function detectSkillInvocations(raw: string): SkillInvocation[] {
  const trimmed = raw.trim()

  // (a) Explicit multi-skill: /skill slug1 slug2 slug3 ... [topic]
  // Parse slugs by taking consecutive valid skill names; stop at the first
  // word that isn't a registered slug — everything after is the topic.
  const cmd = trimmed.match(/^\/skill\s+([\s\S]*)$/i)
  if (cmd) {
    const rest = cmd[1].trim()
    const words = rest.split(/\s+/)
    const slugs: string[] = []
    let topicStart = 0
    for (let i = 0; i < words.length && slugs.length < MAX_MULTI_SKILLS; i++) {
      const candidate = words[i].toLowerCase()
      if (getSkill(candidate)) {
        slugs.push(candidate)
        topicStart = i + 1
      } else {
        break
      }
    }
    const topic = words.slice(topicStart).join(' ').trim()
    const skills = getSkills(slugs)
    if (skills.length === 0) return []
    return skills.map((skill) => ({ skill, topic, via: 'command' as const }))
  }

  // (b) Natural-language: single skill only (phrases don't compose well for multi)
  const single = detectSkillInvocation(raw)
  return single ? [single] : []
}

// Pulls the topic out of a natural-language invocation by removing the trigger
// phrase and the connective words that typically glue it to the topic
// ("run"/"play" before, "on"/"this"/"that"/"my belief that" after). Whatever's
// left is the belief. Best-effort — an empty result just means the skill arms
// and waits for the user's next message.
function extractTopic(raw: string, phrase: string): string {
  const phraseRe = new RegExp(phrase.replace(/['’]/g, "['’]?").replace(/\s+/g, '\\s+'), 'i')
  let rest = raw.replace(phraseRe, ' ').replace(/\s+/g, ' ').trim()
  // Strip leading lead-in verbs left dangling by phrase removal.
  rest = rest.replace(/^(run|play|do|go|let'?s|please)\b/i, '').trim()
  // Strip leading connectives that introduce the topic.
  rest = rest.replace(/^(on|about|against|this|that|my|the|of|for)\b[:,]?\s*/i, '').trim()
  rest = rest.replace(/^(belief|position|plan|idea|take|claim)\s+(that\s+)?[:,]?\s*/i, '').trim()
  return rest
}

// Build a combined system prompt for multiple skills running against the same input.
// Each skill produces its own labeled output section. Skills run independently —
// one skill's output does NOT feed into another.
export function buildMultiSkillPrompt(invocations: SkillInvocation[]): string {
  if (invocations.length === 0) return ''
  if (invocations.length === 1) return invocations[0].skill.systemPrompt

  const names = invocations.map((s) => s.skill.name.toUpperCase()).join(', ')
  const sections = invocations.map((s) =>
    `## ${s.skill.name.toUpperCase()}\n${s.skill.systemPrompt}`
  ).join('\n\n')

  return `You are running MULTIPLE analysis lenses simultaneously against the same input. You are acting as: ${names}.

Each lens is INDEPENDENT — they analyze the same input but do not feed into each other. Produce separate, clearly-labeled output sections for each lens.

FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS:

${invocations.map((s) => `### ${s.skill.name.toUpperCase()}:\n[Your ${s.skill.name} analysis here]`).join('\n\n')}

Do NOT blend the outputs together. Do NOT synthesize across lenses. Keep each lens's output in its own labeled section.

${sections}`
}
