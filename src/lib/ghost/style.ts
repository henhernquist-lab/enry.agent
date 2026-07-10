import type { VoiceSample } from './corpus'

// Ghost Mode — deterministic style extraction.
//
// "How Henry wrote in April" is characterized by measurable habits, not vibes:
// sentence length, capitalization discipline, punctuation signatures,
// contraction rate, and phrases he actually reused in that window. The output
// is rendered as imitation instructions plus verbatim few-shot samples — the
// two things a model can actually follow.

export interface StyleProfile {
  sampleCount: number
  medianSentenceWords: number
  meanSampleChars: number
  lowercaseStartRatio: number
  exclamationPer100Sentences: number
  questionPer100Sentences: number
  emDashPer100Sentences: number
  ellipsisPer100Sentences: number
  contractionRatio: number
  usesEmoji: boolean
  characteristicPhrases: string[]
}

const STOPWORDS = new Set(
  'the a an and or but of to in on at for with is are was were be been it its this that i my me you your he she we they them our'.split(' '),
)

function sentences(text: string): string[] {
  return text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function extractStyle(samples: VoiceSample[]): StyleProfile | null {
  if (samples.length < 3) return null

  const texts = samples.map((s) => s.text)
  const allSentences = texts.flatMap(sentences)
  if (allSentences.length === 0) return null

  const wordCounts = allSentences.map((s) => s.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b)
  const medianSentenceWords = wordCounts[Math.floor(wordCounts.length / 2)] ?? 0

  const lowercaseStarts = allSentences.filter((s) => /^[a-z]/.test(s)).length
  const joined = texts.join(' ')
  const per100 = (n: number) => Math.round((n / allSentences.length) * 100)

  const contractions = (joined.match(/\b\w+'(s|t|re|ve|ll|d|m)\b/gi) ?? []).length
  const totalWords = joined.split(/\s+/).filter(Boolean).length

  return {
    sampleCount: samples.length,
    medianSentenceWords,
    meanSampleChars: Math.round(texts.reduce((a, t) => a + t.length, 0) / texts.length),
    lowercaseStartRatio: lowercaseStarts / allSentences.length,
    exclamationPer100Sentences: per100((joined.match(/!/g) ?? []).length),
    questionPer100Sentences: per100((joined.match(/\?/g) ?? []).length),
    emDashPer100Sentences: per100((joined.match(/—|--/g) ?? []).length),
    ellipsisPer100Sentences: per100((joined.match(/\.\.\.|…/g) ?? []).length),
    contractionRatio: totalWords ? contractions / totalWords : 0,
    usesEmoji: /\p{Extended_Pictographic}/u.test(joined),
    characteristicPhrases: characteristicPhrases(texts),
  }
}

// Bigrams/trigrams Henry repeated inside the window (freq >= 2), minus grams
// made purely of stopwords. These are HIS phrases from THIS window, not
// general slang guesses.
function characteristicPhrases(texts: string[]): string[] {
  const counts = new Map<string, number>()
  for (const text of texts) {
    const words = text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean)
    for (const n of [2, 3]) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n)
        if (gram.every((w) => STOPWORDS.has(w))) continue
        const key = gram.join(' ')
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([phrase]) => phrase)
}

export function renderStyleProfile(style: StyleProfile): string {
  const lines: string[] = []
  lines.push(`- typical sentence length: ~${style.medianSentenceWords} words (median); typical message ~${style.meanSampleChars} characters`)
  if (style.lowercaseStartRatio > 0.5) lines.push('- usually starts sentences lowercase; keep capitalization casual')
  else if (style.lowercaseStartRatio < 0.15) lines.push('- capitalizes sentences normally')
  if (style.exclamationPer100Sentences <= 2) lines.push('- almost never uses exclamation points')
  else if (style.exclamationPer100Sentences >= 15) lines.push('- uses exclamation points freely')
  if (style.emDashPer100Sentences >= 8) lines.push('- reaches for em-dashes often')
  if (style.ellipsisPer100Sentences >= 8) lines.push('- trails off with ellipses')
  if (style.questionPer100Sentences >= 20) lines.push('- thinks out loud in questions')
  lines.push(style.contractionRatio > 0.02 ? '- contracts freely (it\'s, don\'t, gonna)' : '- rarely uses contractions')
  lines.push(style.usesEmoji ? '- occasionally drops an emoji' : '- never uses emoji')
  if (style.characteristicPhrases.length) {
    lines.push(`- phrases he actually reused in this window: ${style.characteristicPhrases.map((p) => `"${p}"`).join(', ')}`)
  }
  return lines.join('\n')
}

// 5-10 verbatim samples: deduped, spread across the window (not clumped on one
// day), mixed lengths so the model sees both quick notes and longer passages.
export function selectVerbatimSamples(samples: VoiceSample[], min = 5, max = 10): VoiceSample[] {
  const seen = new Set<string>()
  const unique = samples.filter((s) => {
    const key = s.text.slice(0, 80)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (unique.length <= max) return unique

  // Sort chronologically, then take an even spread; swap in the longest
  // samples for a couple of slots so voice depth is represented.
  const chrono = [...unique].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const picked: VoiceSample[] = []
  const step = chrono.length / max
  for (let i = 0; i < max; i++) picked.push(chrono[Math.floor(i * step)])
  const longest = [...unique].sort((a, b) => b.text.length - a.text.length).slice(0, 2)
  for (const l of longest) {
    if (!picked.includes(l)) picked[picked.length - 1 - longest.indexOf(l)] = l
  }
  return picked.slice(0, Math.max(min, max))
}
