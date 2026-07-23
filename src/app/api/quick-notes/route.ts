import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 30

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function GET() {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ content: '' })

  const { data } = await supabase
    .from('resources')
    .select('payload')
    .eq('user_id', uid)
    .eq('type', 'quick_note')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const content = (data?.payload as { content?: string } | null)?.content ?? ''
  return Response.json({ content })
}

export async function PUT(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = (await req.json()) as { content: string }

  const { data: existing } = await supabase
    .from('resources')
    .select('id')
    .eq('user_id', uid)
    .eq('type', 'quick_note')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('resources')
      .update({
        payload: { content },
        title: content.slice(0, 80) || 'Quick note',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('resources').insert({
      user_id: uid,
      type: 'quick_note',
      title: content.slice(0, 80) || 'Quick note',
      payload: { content },
    })
  }

  return Response.json({ ok: true })
}
