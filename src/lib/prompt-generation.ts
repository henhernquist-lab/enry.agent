import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

export type PromptCategory = 'coding' | 'writing' | 'study' | 'training' | 'general'

export const CATEGORY_ROTATION: PromptCategory[] = ['coding', 'writing', 'study', 'training', 'general']

export interface GeneratedPrompt {
  title: string
  body: string
  category: PromptCategory
  tags: string[]
  notes: string
}

function buildPrompt(category: PromptCategory): string {
  return `You are a prompt engineer building a personal prompt library for a high schooler who codes, writes, studies, trains for track, and lifts. Generate ONE new, high-quality, reusable AI prompt for the "${category}" category.

Respond with valid JSON only — no markdown fences, no explanation, no preamble.

{
  "title": "string — short, specific, action-oriented (e.g. 'Debug — systematic root cause analysis')",
  "body": "string — the actual prompt text. Use {{PLACEHOLDER}} style variables where the user should fill in specifics. Should be immediately usable, well-structured, and produce a clearly better result than a naive prompt.",
  "tags": ["string", "3 to 5 lowercase tags"],
  "notes": "string — one or two sentences on when/how to use this prompt"
}

Rules:
- Must be genuinely useful and non-generic — avoid restating "write a good X" without structure.
- Body should include concrete rules, steps, or output format, not just a vague ask.
- Return ONLY the JSON object.`
}

export async function generatePrompt(category: PromptCategory): Promise<GeneratedPrompt | null> {
  try {
    const client = createOpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.QWEN_API_KEY ?? '',
    })

    const { text } = await generateText({
      model: client.chat('qwen/qwen3.5-122b-a10b'),
      prompt: buildPrompt(category),
      temperature: 0.7,
      maxOutputTokens: 2048,
      // A hung NIM call previously ate the whole cron route's runtime (5+ min
      // observed) with no error thrown — this call runs 3x in a loop, so an
      // unbounded hang here silently starves everything after it, including
      // Aperture/Chief of Staff. Fail fast instead.
      timeout: 20_000,
      maxRetries: 1,
    })

    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') return null

    return {
      title: parsed.title,
      body: parsed.body,
      category,
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === 'string') : [],
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    }
  } catch (err) {
    console.error('[prompt-generation] failed for category', category, err)
    return null
  }
}
