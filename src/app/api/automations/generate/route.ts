import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

export const maxDuration = 30

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
    console.error('automation generate error:', error)
    return Response.json({ error: 'Generation failed' }, { status: 500 })
  }
}
