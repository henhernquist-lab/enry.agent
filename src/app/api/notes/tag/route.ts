import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { readRequestJson } from '@/lib/request-json'

// Deliberate user action only (button click), same rule as summarize — no
// autosave/debounce trigger. Same model convention (GLM 5.2 / GLM_API_KEY) as
// src/app/api/tools/repo-analyze/route.ts.
export const maxDuration = 30

export async function POST(req: Request) {
  const { content } = await readRequestJson<{ content?: string }>(req)

  if (typeof content !== 'string' || !content.trim()) {
    return Response.json({ error: 'Missing note content' }, { status: 400 })
  }

  const apiKey = process.env.GLM_API_KEY ?? ''
  if (!apiKey) {
    return Response.json({ error: 'No API key configured' }, { status: 500 })
  }

  const client = createOpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
  })

  try {
    const { text } = await generateText({
      model: client.chat('z-ai/glm-5.2'),
      system: 'You tag personal notes. Suggest 2-5 short topical tags (single words or short hyphenated phrases, lowercase, no # prefix). Output ONLY a comma-separated list, nothing else.',
      prompt: content.slice(0, 12000),
    })
    const tags = Array.from(
      new Set(
        text
          .split(',')
          .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
          .filter((t) => t.length > 0 && t.length <= 30),
      ),
    ).slice(0, 6)

    if (tags.length === 0) {
      return Response.json({ error: 'Model returned no usable tags' }, { status: 502 })
    }

    return Response.json({ tags })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('notes/tag error:', detail)
    return Response.json({ error: `Tagging failed: ${detail.slice(0, 200)}` }, { status: 500 })
  }
}
