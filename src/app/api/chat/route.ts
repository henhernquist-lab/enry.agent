import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { tavily } from '@tavily/core'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { saveMemory, searchMemories } from '@/lib/memory'
import { listEvents, createEvent } from '@/lib/calendar'

const MODEL_CONFIG = {
  'deepseek-ai/deepseek-v4-pro': () => process.env.DEEPSEEK_API_KEY ?? '',
  'minimax/minimax-m3':           () => process.env.MINIMAX_API_KEY ?? '',
  'qwen/qwen3.5-122b-a10b':      () => process.env.QWEN_API_KEY ?? '',
  'z-ai/glm-5.2':                () => process.env.GLM_API_KEY ?? '',
} as const

type AllowedModel = keyof typeof MODEL_CONFIG
const ALLOWED_MODELS = Object.keys(MODEL_CONFIG) as AllowedModel[]
const DEFAULT_MODEL: AllowedModel = 'deepseek-ai/deepseek-v4-pro'

export const maxDuration = 60

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY ?? '' })

export async function POST(req: Request) {
  // Authenticate and extract googleId + calendar access token from session
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const s = session as typeof session & { accessToken?: string; calendarError?: string }
  const accessToken = s?.accessToken
  const calendarError = s?.calendarError

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
- save_memory: persist important facts about Henry across conversations. Use this when he shares goals, PRs, preferences, schedules, or anything worth remembering.
- recall_memory: recall past memories before answering personalized questions about Henry's goals, preferences, or history.
- get_calendar_events: fetch Henry's upcoming Google Calendar events. Use when he asks about his schedule, "what's on my calendar", "when's my next X", "am I free on Y", etc. Default to the next 7 days if no time range specified.
- create_calendar_event: add an event to Henry's Google Calendar. Use when he says "add X to my calendar", "schedule Y for Z time", "remind me to do X tomorrow at 3pm", etc. Always confirm the details before creating.

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
    stopWhen: stepCountIs(7),
    tools: {
      web_search: tool({
        description: 'Search the web for current, real-time information. Use this for news, prices, recent events, people, or anything that may have changed.',
        inputSchema: z.object({
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

      save_memory: tool({
        description: 'Save an important fact about the user to long-term memory. Use this when the user shares personal goals, PRs, preferences, schedules, important events, or anything worth remembering for future conversations.',
        inputSchema: z.object({
          content: z.string().describe('The fact or information to remember about the user'),
        }),
        execute: async ({ content }) => {
          if (!googleId) {
            return { success: false, error: 'Not authenticated — cannot save memory.' }
          }
          const result = await saveMemory(googleId, content)
          if (result.error) {
            return { success: false, error: result.error }
          }
          return { success: true, id: result.id, content }
        },
      }),

      recall_memory: tool({
        description: "Search the user's long-term memory for relevant past information. Use this before answering personalized questions about the user's goals, preferences, history, or past conversations.",
        inputSchema: z.object({
          query: z.string().describe('What to search for in memory'),
          limit: z.number().optional().default(5).describe('Maximum number of results to return'),
        }),
        execute: async ({ query, limit }) => {
          if (!googleId) {
            return { results: [], error: 'Not authenticated — cannot search memory.' }
          }
          const result = await searchMemories(googleId, query, limit)
          if (result.error) {
            return { results: [], error: result.error }
          }
          return { results: result.results }
        },
      }),

      get_calendar_events: tool({
        description: "Fetch upcoming events from Henry's Google Calendar. Use when he asks about his schedule, upcoming events, or whether he's free at a given time.",
        inputSchema: z.object({
          days_ahead: z.number().optional().default(7).describe('How many days ahead to fetch (default 7)'),
          time_min: z.string().optional().describe('ISO 8601 start time (defaults to now)'),
          time_max: z.string().optional().describe('ISO 8601 end time (defaults to days_ahead from now)'),
        }),
        execute: async ({ days_ahead, time_min, time_max }) => {
          if (!accessToken) {
            const reason = calendarError === 'no_refresh_token'
              ? 'Calendar access requires re-authentication with the new Calendar permissions. Please sign out and sign back in.'
              : calendarError === 'refresh_failed'
              ? 'Your Google Calendar token could not be refreshed. Please sign out and sign back in.'
              : 'No Google Calendar access token found. Please sign out and sign back in to grant Calendar permissions.'
            return { events: [], error: reason }
          }
          const now = new Date()
          const min = time_min ?? now.toISOString()
          const max = time_max ?? new Date(now.getTime() + (days_ahead ?? 7) * 86400000).toISOString()
          const { events, error } = await listEvents(accessToken, min, max)
          if (error) return { events: [], error }
          return {
            events: events.map((e) => ({
              id: e.id,
              title: e.summary,
              start: e.start.dateTime ?? e.start.date,
              end: e.end.dateTime ?? e.end.date,
              description: e.description,
              location: e.location,
              link: e.htmlLink,
            })),
          }
        },
      }),

      create_calendar_event: tool({
        description: "Add a new event to Henry's Google Calendar. Use when he wants to schedule something.",
        inputSchema: z.object({
          summary: z.string().describe('Event title'),
          start_datetime: z.string().describe('Start time in ISO 8601 format (e.g. 2025-07-10T15:00:00)'),
          end_datetime: z.string().describe('End time in ISO 8601 format'),
          description: z.string().optional().describe('Optional event description or notes'),
          location: z.string().optional().describe('Optional location'),
          timezone: z.string().optional().default('America/Chicago').describe('IANA timezone (default America/Chicago)'),
        }),
        execute: async ({ summary, start_datetime, end_datetime, description, location, timezone }) => {
          if (!accessToken) {
            const reason = calendarError
              ? 'Calendar token error — please sign out and sign back in to grant Calendar permissions.'
              : 'No Calendar access. Please sign out and sign back in.'
            return { success: false, error: reason }
          }
          const tz = timezone ?? 'America/Chicago'
          const { event, error } = await createEvent(accessToken, {
            summary,
            description,
            location,
            start: { dateTime: start_datetime, timeZone: tz },
            end: { dateTime: end_datetime, timeZone: tz },
          })
          if (error) return { success: false, error }
          return {
            success: true,
            event: {
              id: event!.id,
              title: event!.summary,
              start: event!.start.dateTime ?? event!.start.date,
              end: event!.end.dateTime ?? event!.end.date,
              link: event!.htmlLink,
            },
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