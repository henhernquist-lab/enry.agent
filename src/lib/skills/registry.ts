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

// The registry. Adding a skill = import its definition and add it to this
// array. Everything else (invocation, banner, round-tracking, exit, the
// skill-aware system prompt on the server) reads from these declarations —
// no per-skill code anywhere else.
export const SKILLS: SkillDefinition[] = [
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
]

export function getSkill(slug: string): SkillDefinition | undefined {
  return SKILLS.find((s) => s.slug === slug)
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
