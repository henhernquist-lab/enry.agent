import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

// Was qwen/qwen3.5-397b-a17b — confirmed dead on NIM's backend: even a
// plain text completion 404s with "Specified function in account ... is
// not found" (verified directly against /v1/chat/completions), despite
// the model still being listed by GET /v1/models. That's what actually
// broke every image upload — describeImage() runs on every upload
// regardless of which chat model the user has selected, so the failure
// was 100% reproducible and had nothing to do with file size or storage.
//
// nvidia/nemotron-nano-12b-v2-vl confirmed live and vision-capable via a
// real end-to-end test (correctly identified the color of a test image),
// using the existing NVIDIA_API_KEY — no new env var needed.
const VISION_MODEL = 'nvidia/nemotron-nano-12b-v2-vl'

export async function describeImage(imageUrl: string, mediaType: string): Promise<{ description: string | null; error: string | null }> {
  try {
    const client = createOpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY ?? '',
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
