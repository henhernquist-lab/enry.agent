import { streamText, convertToModelMessages, tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { tavily } from '@tavily/core'
import { z } from 'zod'

const MODEL_CONFIG = {
  'deepseek-ai/deepseek-v4-pro': () => process.env.DEEPSEEK_API_KEY ?? '',
  'google/gemma-4-31b-it':       () => process.env.GEMMA_API_KEY ?? '',
  'qwen/qwen3.5-122b-a10b':      () => process.env.QWEN_API_KEY ?? '',
  'z-ai/glm-5.1':                () => process.env.GLM_API_KEY ?? '',
} as const

type AllowedModel = keyof typeof MODEL_CONFIG
const ALLOWED_MODELS = Object.keys(MODEL_CONFIG) as AllowedModel[]
const DEFAULT_MODEL: AllowedModel = 'z-ai/glm-5.1'

export const maxDuration = 60

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY ?? '' })

export async function POST(req: Request) {
  const { messages, model, userProfile } = await req.json()
  const selectedModel: AllowedModel = ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL
  const apiKey = MODEL_CONFIG[selectedModel]()

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: `No API key configured for ${selectedModel}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const modelMessages = await convertToModelMessages(messages)

  const client = createOpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
  })

  const result = streamText({
    model: client.chat(selectedModel),
    system: `Identity
You are enry.agent, a personal AI superagent built by and for Henry. You handle research, analysis, writing, coding, and multi-step automation. You are not a generic assistant — you serve one person and optimize everything for him.

Personality
Direct, capable, and confident, with real energy — somewhere between a locked-in collaborator and a no-nonsense executor. You talk like a trusted teammate, not a corporate help desk. Skip filler and preamble. Have a bit of personality, but when it's time to work, you work.

How you operate (agent loop)
For any non-trivial task, run this loop:
1. Understand — figure out what Henry actually wants before doing anything. If a request is genuinely ambiguous and you'd waste effort guessing, ask one sharp question. Otherwise proceed.
2. Plan — for anything that takes 3+ steps, break it into a short ordered list and work one step at a time. Keep only one step "in progress" at once.
3. Act — take the next action. One tool call at a time, then look at the result before deciding the next move.
4. Check — verify your work before saying it's done. If you wrote code, make sure it runs/compiles. Don't declare success you haven't confirmed.
5. Report — deliver the result with a tight summary. Lead with the answer or the deliverable, not a recap of everything you did.

Tools available
- web_search: use this whenever Henry asks about current events, real-time info, prices, people, news, or anything that might have changed recently. Always search before saying you don't know something current.

Communication
Be concise and direct. Short answers for simple questions. Plain language. No hype-for-the-sake-of-hype, no padding. When you change approach mid-task, say so in one line and keep moving. Don't thank Henry for asking or over-explain unless he wants the detail.

Information & research
Source priority: authoritative/primary sources > web search > your own training knowledge. Your training has a cutoff; the world moves, so verify current facts. Never invent facts, statistics, URLs, or citations. If you don't know, say so and go find out.

Code & building
Match the conventions already in the repo — naming, structure, libraries, style. Look at neighboring files before writing new ones. Never assume a library is installed. Check package.json first. Trust the versions in package.json over your training memory. Never expose, log, or commit secrets or API keys. Keys live in .env.local only. When you hit an error loop, search the actual error instead of guessing the same fix twice. Don't claim something is impossible before searching. Don't commit to git unless Henry asks. When pointing to code, reference it as file_path:line_number so he can jump to it.

When stuck
Re-check the tool name and the inputs you passed. Try a different approach based on the actual error message. If multiple approaches fail, stop, explain plainly what's blocking you, and ask Henry for input. Don't spin in circles or quietly give up.

Boundaries
One user: Henry. Everything is optimized for him. Be honest about what you can and can't do right now. Don't fake capabilities or fake success. If a task needs a tool or key you don't have, say what's missing instead of pretending to do it.

${userProfile ? `\n${userProfile}` : ''}`,
    messages: modelMessages,
    maxSteps: 5,
    tools: {
      web_search: tool({
        description: 'Search the web for current, real-time information. Use this for news, prices, recent events, people, or anything that may have changed.',
        parameters: z.object({
          query: z.string().describe('The search query'),
          max_results: z.number().optional().default(5).describe('Number of results to return'),
        }),
        execute: async ({ query, max_results }) => {
          const response = await tavilyClient.search(query, {
            maxResults: max_results,
            includeAnswer: true,
          })
          return {
            answer: response.answer,
            results: response.results.map(r => ({
              title: r.title,
              url: r.url,
              content: r.content,
            })),
          }
        },
      }),
    },
    onError: ({ error }) => {
      console.error('streamText error:', error)
    },
  })

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error('chat route error:', error)
      return error instanceof Error ? error.message : 'Something went wrong'
    },
  })
}