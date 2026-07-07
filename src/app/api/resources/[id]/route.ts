import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 30

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data, error } = await supabase
    .from('resources')
    .select('id, user_id, type, source, title, payload, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', uid)
    .maybeSingle()

  if (error) return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ resource: data })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('resources')
    .delete()
    .eq('id', id)
    .eq('user_id', uid)

  if (error) return Response.json({ error: 'Failed to delete' }, { status: 500 })
  return Response.json({ ok: true })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { type, title, payload } = body

  if (typeof title !== 'string' || !title.trim()) {
    return Response.json({ error: 'Title required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('resources')
    .update({
      title: title.trim().slice(0, 200),
      payload: payload ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', uid)
    .select('id, user_id, type, source, title, payload, created_at, updated_at')
    .single()

  if (error) return Response.json({ error: 'Failed to update' }, { status: 500 })

  if (type === 'prompt') {
    const pp = payload as { body?: string; tags?: string[] }
    const text = [title, pp.body, ...(pp.tags ?? [])].filter(Boolean).join('\n\n')
    generateEmbedding(text)
      .then((embedding) => {
        if (embedding) supabase.from('resources').update({ embedding }).eq('id', id).then()
      })
      .catch(console.error)
  }

  return Response.json({ resource: data })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: current, error: fetchErr } = await supabase
    .from('resources')
    .select('payload')
    .eq('id', id)
    .eq('user_id', uid)
    .maybeSingle()

  if (fetchErr || !current) return Response.json({ error: 'Not found' }, { status: 404 })

  const old = (current.payload ?? {}) as Record<string, unknown>
  const updated = {
    ...old,
    use_count: ((old.use_count as number) ?? 0) + 1,
    last_used_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('resources')
    .update({ payload: updated, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', uid)

  if (error) return Response.json({ error: 'Failed to track' }, { status: 500 })
  return Response.json({ ok: true })
}
