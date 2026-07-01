import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id?: string }).id
  if (!userId) {
    return Response.json({ error: 'No user id' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('profile_data')
    .eq('google_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Supabase profile fetch error:', error)
    return Response.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }

  return Response.json({ profile: data?.profile_data ?? null })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id?: string }).id
  if (!userId) {
    return Response.json({ error: 'No user id' }, { status: 400 })
  }

  const body = await req.json()
  const { profile } = body

  if (!profile || typeof profile !== 'object') {
    return Response.json({ error: 'Invalid profile data' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        google_id: userId,
        email: session.user.email,
        name: session.user.name,
        avatar_url: (session.user as { image?: string }).image,
        profile_data: profile,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'google_id' },
    )

  if (error) {
    console.error('Supabase profile upsert error:', error)
    return Response.json({ error: 'Failed to save profile' }, { status: 500 })
  }

  return Response.json({ success: true })
}
