import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { readRequestJson } from '@/lib/request-json'

// Deliberate user action only (button click) — never called from autosave or
// debounce. Follows the lightweight-utility model convention already used by
// src/app/api/tools/repo-analyze/route.ts and repo-review/route.ts: GLM 5.2
// via GLM_API_KEY, non-streaming generateText, plain JSON response.
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
      system: 'You summarize personal notes. Output 1-3 short sentences capturing the core point — no preamble, no headers, no bullet points, no restating "this note is about".',
      prompt: content.slice(0, 12000),
    })
    return Response.json({ summary: text.trim() })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('notes/summarize error:', detail)
    return Response.json({ error: `Summarize failed: ${detail.slice(0, 200)}` }, { status: 500 })
  }
}
