import { streamText } from 'ai'
import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { nimClientFor, DEFAULT_NIM_MODEL } from '@/lib/nim'
import { buildPersona } from '@/lib/ghost/persona'

export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_MESSAGES = 60

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

interface GhostMessage {
  role: 'user' | 'ghost'
  content: string
}

// POST { window: {start, end, label}, messages } → text stream of Past-Henry's
// reply. The persona prompt is built server-side from the caller's own data —
// the client never supplies or sees the system prompt, so it can't be
// tampered into ignoring the knowledge cutoff.
export async function POST(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const start = String(body.window?.start ?? '')
  const end = String(body.window?.end ?? '')
  const label = String(body.window?.label ?? '').slice(0, 80) || `${start} — ${end}`
  const messages = (Array.isArray(body.messages) ? body.messages : []) as GhostMessage[]

  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
    return Response.json({ error: 'Invalid window' }, { status: 400 })
  }
  if (messages.length === 0 || messages.length > MAX_MESSAGES) {
    return Response.json({ error: 'Invalid messages' }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const persona = await buildPersona(uid, { start, end: end > today ? today : end, label })

  const client = nimClientFor()
  const result = streamText({
    model: client.chat(DEFAULT_NIM_MODEL),
    system: persona.systemPrompt,
    messages: messages.map((m) => ({
      role: m.role === 'ghost' ? ('assistant' as const) : ('user' as const),
      content: String(m.content ?? '').slice(0, 4000),
    })),
    temperature: 0.8,
    maxOutputTokens: 700,
  })

  return result.toTextStreamResponse()
}
