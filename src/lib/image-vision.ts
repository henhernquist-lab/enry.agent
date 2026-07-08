import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

// Qwen 3.5 122B — one of only two NIM models with native image input
// (confirmed against docs/model-selection-guide.md); the other is MiniMax M3.
const VISION_MODEL = 'qwen/qwen3.5-122b-a10b'

export async function describeImage(imageUrl: string, mediaType: string): Promise<{ description: string | null; error: string | null }> {
  try {
    const client = createOpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.QWEN_API_KEY ?? '',
    })

    const { text } = await generateText({
      model: client.chat(VISION_MODEL),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image in 2-4 sentences. Be specific and factual — mention text, objects, people, charts, or code visible in the image. If it contains readable text, transcribe the key parts.' },
            { type: 'file', mediaType, data: new URL(imageUrl) },
          ],
        },
      ],
      temperature: 0.2,
      maxOutputTokens: 500,
    })

    const description = text.trim()
    if (!description) return { description: null, error: 'Model returned an empty description.' }
    return { description, error: null }
  } catch (err) {
    console.error('[image-vision] describeImage failed:', err)
    return { description: null, error: 'Could not analyze this image — try again.' }
  }
}
