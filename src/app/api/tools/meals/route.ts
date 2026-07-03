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
  const date = searchParams.get('date') // YYYY-MM-DD, optional

  let query = supabase
    .from('meals')
    .select('*')
    .eq('google_id', googleId)
    .order('logged_at', { ascending: false })

  if (date) {
    query = query
      .gte('logged_at', `${date}T00:00:00Z`)
      .lte('logged_at', `${date}T23:59:59Z`)
  } else {
    query = query.limit(200)
  }

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ meals: data })
}

export async function POST(req: Request) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { description, calories, protein, carbs, fat } = await req.json()
  if (!description) return Response.json({ error: 'Missing description' }, { status: 400 })

  const { data, error } = await supabase
    .from('meals')
    .insert({
      google_id: googleId,
      description,
      calories: calories ?? 0,
      protein: protein ?? 0,
      carbs: carbs ?? 0,
      fat: fat ?? 0,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ meal: data })
}

export async function DELETE(req: Request) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('meals')
    .delete()
    .eq('id', id)
    .eq('google_id', googleId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
