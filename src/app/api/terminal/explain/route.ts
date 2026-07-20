import { streamText } from 'ai'
import { auth } from '@/lib/auth'
import { getChatModel, DEFAULT_MODEL_ID, isModelConfigured } from '@/lib/nim'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

// POST /api/terminal/explain — on-demand, Feynman-style explanation of a
// single shell command run in a Drive terminal pane. Opt-in per use (the pane
// only calls this when the user hits "Explain"), never auto-invoked. Reuses
// the shared model router (nim.ts getChatModel) — no hardcoded explanations,
// no lookup table. Streams plain text so the pane can render it live inline.

const MAX_COMMAND_LEN = 2000

const SYSTEM_PROMPT = `You explain shell commands to a capable developer who wants to actually LEARN, not just get a definition. Teach in the spirit of Feynman: make the "why" click, not just the "what".

Rules:
- Lead with one sentence: what this command actually does, in plain language.
- If the command is compound (pipes, &&/||/;, subshells, command substitution) OR has multiple flags, break it into its parts and explain each part and each flag — what it does and WHY it's there / why it's structured this way.
- Call out anything non-obvious: side effects, things that write vs. only read, destructive potential, common gotchas, or a subtle reason the flags are ordered/combined the way they are.
- If a flag has a short and long form, mention it. If a piece is a common idiom, name the idiom.
- Be genuinely educational but tight — no filler, no "Great question", no restating the command verbatim as a heading. Real sentences and, where it helps, a short per-part breakdown.
- Plain text / light Markdown only (a dash list or inline backticks are fine). No huge headers. Assume a narrow terminal-width column.
- If the input is not actually a runnable command (blank, just a path, garbage), say so briefly instead of inventing an explanation.`

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let command = ''
  let requestedModel: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.command === 'string') command = body.command.trim()
    if (typeof body?.model === 'string' && body.model) requestedModel = body.model
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!command) return Response.json({ error: 'No command to explain' }, { status: 400 })
  if (command.length > MAX_COMMAND_LEN) command = command.slice(0, MAX_COMMAND_LEN)

  // Prefer the requested model if it's configured, else the Drive default.
  const modelId = requestedModel && isModelConfigured(requestedModel) ? requestedModel : DEFAULT_MODEL_ID

  const result = streamText({
    model: getChatModel(modelId),
    system: SYSTEM_PROMPT,
    prompt: `Explain this shell command:\n\n${command}`,
    // Single, bounded call — fail once cleanly rather than letting an
    // auto-retry double wall-clock past maxDuration (same rationale as
    // the chat route's maxRetries: 0).
    maxRetries: 0,
    onError: ({ error }) => console.error('[terminal/explain] streamText error:', error),
  })

  return result.toTextStreamResponse()
}
