import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export const maxDuration = 30

async function getGoogleId(): Promise<string | null> {
  const session = await auth()
  return (session?.user as { id?: string })?.id ?? null
}

export async function GET(req: Request) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const habitId = searchParams.get('habit_id')

  let query = supabase
    .from('habit_logs')
    .select('*')
    .eq('google_id', googleId)
    .order('checked_on', { ascending: false })
    .limit(365)

  if (habitId) query = query.eq('habit_id', habitId)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ logs: data })
}

export async function POST(req: Request) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { habit_id, checked_on } = await req.json()
  if (!habit_id) return Response.json({ error: 'Missing habit_id' }, { status: 400 })

  const date = checked_on ?? new Date().toISOString().slice(0, 10)

  // Toggle: if log exists for today, delete it; otherwise insert
  const { data: existing } = await supabase
    .from('habit_logs')
    .select('id')
    .eq('habit_id', habit_id)
    .eq('checked_on', date)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('habit_logs').delete().eq('id', existing.id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ checked: false })
  }

  const { error } = await supabase
    .from('habit_logs')
    .insert({ habit_id, google_id: googleId, checked_on: date })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ checked: true })
}
