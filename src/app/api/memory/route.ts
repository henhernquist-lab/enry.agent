import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import type { MemoryPayload } from '@/lib/resources'
import { emitResourceSaved } from '@/lib/resource-events'

export const maxDuration = 30

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

// Memories are stored as rows in `resources` with type='memory'. source is
// always 'user' (Enry-captured or imported by Henry). An `imported` flag in the
// payload marks entries pasted from another AI so the UI can badge them.

export async function GET() {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('resources')
    .select('id, type, source, title, payload, created_at, updated_at')
    .eq('user_id', uid)
    .eq('type', 'memory')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  return Response.json({ memories: data ?? [] })
}

export async function POST(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { content, origin, imported } = body as {
    content?: string
    origin?: string
    imported?: boolean
  }

  if (typeof content !== 'string' || !content.trim()) {
    return Response.json({ error: 'Content required' }, { status: 400 })
  }

  const text = content.trim()
  const payload: MemoryPayload = {
    content: text,
    imported: imported === true ? true : undefined,
    origin: origin?.trim() ? origin.trim().slice(0, 60) : undefined,
  }
  const title = text.length > 80 ? `${text.slice(0, 80)}…` : text

  const { data, error } = await supabase
    .from('resources')
    .insert({
      user_id: uid,
      type: 'memory',
      source: 'user',
      title: title.slice(0, 200),
      payload,
    })
    .select('id, type, source, title, payload, created_at, updated_at')
    .single()

  if (error) {
    console.error('[memory] insert failed:', error)
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }

  emitResourceSaved()
  return Response.json({ memory: data })
}

export async function DELETE(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('resources')
    .delete()
    .eq('id', id)
    .eq('user_id', uid)
    .eq('type', 'memory')

  if (error) return Response.json({ error: 'Failed to delete' }, { status: 500 })
  emitResourceSaved()
  return Response.json({ ok: true })
}
