import { generateText } from 'ai'
import { nimClientFor } from '@/lib/nim'

export const maxDuration = 60

// Automations default model — scoped to a fast, capable general-purpose model.
// Swappable by changing the id here; the client/key config stays in nim.ts.
const AUTOMATION_MODEL = 'z-ai/glm-5.2'

export async function POST(req: Request) {
  const { prompt, system } = await req.json()

  if (!prompt || typeof prompt !== 'string') {
    return Response.json({ error: 'Missing prompt' }, { status: 400 })
  }

  let client: ReturnType<typeof nimClientFor>
  try {
    client = nimClientFor(AUTOMATION_MODEL)
  } catch {
    return Response.json({ error: 'No API key configured for automations' }, { status: 500 })
  }

  try {
    const { text } = await generateText({
      model: client.chat(AUTOMATION_MODEL),
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
