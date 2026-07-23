import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import type { ModelStatus, ModelStatusRecord } from '@/lib/model-status'

export const maxDuration = 30

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function GET() {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('model_statuses')
    .select('*')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false })

  if (error) return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  return Response.json({ statuses: (data ?? []) as ModelStatusRecord[] })
}

export async function PATCH(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { model_id, status, note } = body as {
    model_id?: string
    status?: ModelStatus
    note?: string
  }

  if (typeof model_id !== 'string' || !model_id.trim()) {
    return Response.json({ error: 'model_id required' }, { status: 400 })
  }
  if (!status || !['live', 'degraded', 'down'].includes(status)) {
    return Response.json({ error: 'status must be live, degraded, or down' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('model_statuses')
    .upsert(
      {
        user_id: uid,
        model_id: model_id.trim(),
        status,
        note: note?.trim() ? note.trim().slice(0, 200) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,model_id' },
    )
    .select()
    .single()

  if (error) {
    console.error('[model-status] upsert failed:', error)
    return Response.json({ error: 'Failed to update' }, { status: 500 })
  }

  return Response.json({ status: data as ModelStatusRecord })
}
