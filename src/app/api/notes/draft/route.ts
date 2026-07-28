import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 30

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

async function resolveUserId(): Promise<string | null> {
  const session = await auth()
  return resolveResourceUserId(userId(session))
}

// GET — fetch the current draft (if any)
export async function GET() {
  const uid = await resolveUserId()
  if (!uid) return Response.json({ content: '', exists: false })

  const { data } = await supabase
    .from('resources')
    .select('payload, created_at')
    .eq('user_id', uid)
    .eq('type', 'note_draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return Response.json({ content: '', exists: false })

  const content = (data.payload as { content?: string } | null)?.content ?? ''
  return Response.json({ content, exists: true })
}

// PUT — save/update the draft
export async function PUT(req: Request) {
  const uid = await resolveUserId()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = (await req.json()) as { content: string }

  const { data: existing } = await supabase
    .from('resources')
    .select('id')
    .eq('user_id', uid)
    .eq('type', 'note_draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('resources')
      .update({ payload: { content }, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase.from('resources').insert({
      user_id: uid,
      type: 'note_draft',
      source: 'user',
      title: '',
      payload: { content },
    })
  }

  return Response.json({ ok: true })
}

// DELETE — clear the draft (called after commit)
// Not exposed as a real HTTP method; kept for internal use via POST with action
export async function POST(req: Request) {
  const uid = await resolveUserId()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as { action: string }
  if (body.action !== 'commit') {
    return Response.json({ error: 'Unknown action' }, { status: 400 })
  }

  // Delete the draft row
  const { data: existing } = await supabase
    .from('resources')
    .select('id')
    .eq('user_id', uid)
    .eq('type', 'note_draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    await supabase.from('resources').delete().eq('id', existing.id)
  }

  return Response.json({ ok: true })
}
