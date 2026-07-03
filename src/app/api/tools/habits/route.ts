import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export const maxDuration = 30

async function getGoogleId(): Promise<string | null> {
  const session = await auth()
  return (session?.user as { id?: string })?.id ?? null
}

export async function GET() {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('google_id', googleId)
    .order('created_at', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ habits: data })
}

export async function POST(req: Request) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, frequency } = await req.json()
  if (!name) return Response.json({ error: 'Missing name' }, { status: 400 })

  const { data, error } = await supabase
    .from('habits')
    .insert({ google_id: googleId, name, frequency: frequency ?? 'daily' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ habit: data })
}

export async function DELETE(req: Request) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('habits')
    .delete()
    .eq('id', id)
    .eq('google_id', googleId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
