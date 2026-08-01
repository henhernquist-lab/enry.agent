import { SKILLS } from './registry'
import type { SkillInvocation } from './registry'

// ─── Relevance-based skill detection ─────────────────────────────────
//
// Runs on every message. Scans the message against all registered skills'
// trigger phrases using the same word-boundary matching logic as the
// manual /skill invocation path (detectSkillInvocation). Returns ALL
// matching skills, not just the first — so a single message can trigger
// multiple relevant skills simultaneously.
//
// This is intentionally the SAME matching strictness as the manual path.
// No fuzzy/LLM relevance heuristic that fires more eagerly. If a message
// wouldn't trigger a skill via manual /skill or natural-language phrase,
// it won't trigger it here either.

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/\s+/g, ' ').trim()
}

function extractTopic(raw: string, phrase: string): string {
  const phraseRe = new RegExp(phrase.replace(/['']/g, "['']?").replace(/\s+/g, '\\s+'), 'i')
  let rest = raw.replace(phraseRe, ' ').replace(/\s+/g, ' ').trim()
  rest = rest.replace(/^(run|play|do|go|let'?s|please)\b/i, '').trim()
  rest = rest.replace(/^(on|about|against|this|that|my|the|of|for)\b[:,]?\s*/i, '').trim()
  rest = rest.replace(/^(belief|position|plan|idea|take|claim)\s+(that\s+)?[:,]?\s*/i, '').trim()
  return rest
}

// Scan the message against ALL registered skills' trigger phrases.
// Returns every skill whose trigger phrase appears in the message on a
// word boundary. Same logic as detectSkillInvocation(), but collects all
// matches instead of stopping at the first.
export function detectRelevantSkills(raw: string): SkillInvocation[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  const norm = normalize(trimmed)
  const results: SkillInvocation[] = []
  const seenSlugs = new Set<string>()

  for (const skill of SKILLS) {
    for (const phrase of skill.triggerPhrases) {
      const np = normalize(phrase)
      const idx = norm.indexOf(np)
      if (idx === -1) continue

      // Word-boundary check — same as detectSkillInvocation
      const before = idx === 0 ? ' ' : norm[idx - 1]
      const after = norm[idx + np.length]
      const isAfterBoundary = after === undefined || after === ' ' || /[:,.;?!\-]/.test(after)
      if (before !== ' ' || !isAfterBoundary) continue

      // Found a match. Deduplicate: a skill with overlapping phrases
      // shouldn't fire twice for the same message.
      if (seenSlugs.has(skill.slug)) continue
      seenSlugs.add(skill.slug)

      results.push({
        skill,
        topic: extractTopic(trimmed, phrase),
        via: 'phrase',
      })
      break // Next skill
    }
  }

  return results
}
