import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { casUpdateSessionPayload } from '@/lib/session-cas'
import { dispatchLearn, LEARN_VERBS, type LearnVerb, type LearnOpsContext } from '@/lib/learn/learn-ops'
import type { LearnSessionPayload, LearnCommand } from '@/lib/resources'

// Mirrors /api/terminal/exec's structure exactly (auth -> parse -> ensure
// session -> dispatch -> append command -> read back state -> respond) —
// same shape, Learn's own verbs and session payload instead of Drive's.
export const maxDuration = 60

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function POST(req: Request) {
  const session = await auth()
  const rawUserId = userId(session)
  const uid = await resolveResourceUserId(rawUserId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const verbRaw = String(body.verb ?? '').trim()
  const input = String(body.input ?? '')
  const requestedSessionId: string | null = body.session_id ?? null
  const model = typeof body.model === 'string' ? body.model : undefined
  const isRecovery = body.recovery === true
  const partialContent = typeof body.partial_content === 'string' ? body.partial_content : undefined

  if (!(LEARN_VERBS as readonly string[]).includes(verbRaw)) {
    return Response.json({ error: `Unknown verb "${verbRaw}". One of: ${LEARN_VERBS.join(', ')}` }, { status: 400 })
  }
  const verb = verbRaw as LearnVerb

  const sessionId = await ensureSessionId(uid, requestedSessionId)
  if (!sessionId) return Response.json({ error: 'Could not start learn session' }, { status: 500 })

  // rawUserId is the NextAuth session id (google_id in older sessions,
  // profiles.id in newer ones per resolveResourceUserId's own comment) —
  // searchMemories keys on whatever that raw value is, same as chat/route.ts
  // already does. uid (profiles.id) is what claims.user_id actually FKs to.
  const ctx: LearnOpsContext = { userId: uid, googleId: rawUserId ?? undefined, sessionId, model, isRecovery, partialContent }
  const result = await dispatchLearn(verb, input, ctx)

  const entry: LearnCommand = {
    verb,
    input,
    output: result.output,
    timestamp: new Date().toISOString(),
    exit_code: result.exitCode,
  }
  await appendCommand(uid, sessionId, entry)

  const pending = await readPending(uid, sessionId)

  return Response.json({
    output: result.output,
    exit_code: result.exitCode,
    session_id: sessionId,
    data: result.data ?? null,
    pending_probe: pending.pending_probe,
    pending_defense: pending.pending_defense,
    pending_teach: pending.pending_teach,
  })
}

async function ensureSessionId(uid: string, requestedSessionId: string | null): Promise<string | null> {
  if (requestedSessionId) {
    const { data } = await supabase
      .from('resources')
      .select('id')
      .eq('id', requestedSessionId)
      .eq('user_id', uid)
      .maybeSingle()
    if (data) return data.id
  }

  const payload: LearnSessionPayload = {
    commands: [],
    session_start: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('resources')
    .insert({ user_id: uid, type: 'learn_session', source: 'user', title: 'Learn session', payload })
    .select('id')
    .single()
  if (error) {
    console.error('[learn] session insert failed:', error)
    return null
  }
  return data.id
}

async function appendCommand(uid: string, sessionId: string, entry: LearnCommand): Promise<void> {
  try {
    await casUpdateSessionPayload<LearnSessionPayload>(sessionId, uid, (payload) => ({
      commands: [...(payload.commands ?? []), entry].slice(-200),
      session_end: entry.timestamp,
    }))
  } catch (e) {
    console.error('[learn] append failed:', e)
  }
}

// Read whatever interaction is in flight for this session — probe, defend, or
// teach. The client routes the user's next bare message to whichever is set
// (only one is ever non-null at a time, same "one thing in flight" discipline).
async function readPending(uid: string, sessionId: string): Promise<{
  pending_probe: LearnSessionPayload['pending_probe']
  pending_defense: LearnSessionPayload['pending_defense']
  pending_teach: LearnSessionPayload['pending_teach']
}> {
  const { data } = await supabase
    .from('resources')
    .select('payload')
    .eq('id', sessionId)
    .eq('user_id', uid)
    .maybeSingle()
  const payload = data?.payload as LearnSessionPayload | undefined
  return {
    pending_probe: payload?.pending_probe ?? null,
    pending_defense: payload?.pending_defense ?? null,
    pending_teach: payload?.pending_teach ?? null,
  }
}
