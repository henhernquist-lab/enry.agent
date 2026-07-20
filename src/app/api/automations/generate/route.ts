import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

export const maxDuration = 60

export async function POST(req: Request) {
  const { prompt, system } = await req.json()

  if (!prompt || typeof prompt !== 'string') {
    return Response.json({ error: 'Missing prompt' }, { status: 400 })
  }

  const apiKey = process.env.GLM_API_KEY ?? ''
  if (!apiKey) {
    return Response.json({ error: 'No API key configured for automations' }, { status: 500 })
  }

  const client = createOpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
  })

  try {
    const { text } = await generateText({
      model: client.chat('z-ai/glm-5.2'),
      system,
      prompt,
    })
    return Response.json({ text })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('automation generate error:', detail)
    // Surface the actual error so the caller can show it to the user.
    // Common failures: context too large for the model, API timeout, rate limit.
    const userMsg = detail.includes('context length') || detail.includes('too long')
      ? 'Prompt too large — this repo has too many files. Try a smaller repo or a specific file question.'
      : detail.includes('timeout') || detail.includes('timed out')
        ? 'Model timed out — the repo is too large to analyze in one pass. Try a specific file question.'
        : `Generation failed: ${detail.slice(0, 200)}`
    return Response.json({ error: userMsg }, { status: 500 })
  }
}
