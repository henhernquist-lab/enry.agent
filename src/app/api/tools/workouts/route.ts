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
    .from('workouts')
    .select('*')
    .eq('google_id', googleId)
    .order('logged_at', { ascending: false })
    .limit(100)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ workouts: data })
}

export async function POST(req: Request) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { exercise, sets } = await req.json()
  if (!exercise || !Array.isArray(sets)) {
    return Response.json({ error: 'Missing exercise or sets' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('workouts')
    .insert({ google_id: googleId, exercise, sets })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ workout: data })
}

export async function DELETE(req: Request) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', id)
    .eq('google_id', googleId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
