import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export const maxDuration = 30

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const uid = userId(session)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .eq('id', id)
    .eq('google_id', uid)
    .maybeSingle()

  if (error) return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ resource: data })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const uid = userId(session)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('resources')
    .delete()
    .eq('id', id)
    .eq('google_id', uid)

  if (error) return Response.json({ error: 'Failed to delete' }, { status: 500 })
  return Response.json({ ok: true })
}
