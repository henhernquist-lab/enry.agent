import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await auth()
  console.log('[profile/route GET] Service role key present:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'yes' : 'MISSING!')
  if (!session?.user) {
    console.log('[profile/route GET] Unauthorized — no session')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id?: string }).id
  if (!userId) {
    console.log('[profile/route GET] No user id in session')
    return Response.json({ error: 'No user id' }, { status: 400 })
  }

  console.log('[profile/route GET] Fetching profile for google_id:', userId)

  const { data, error } = await supabase
    .from('profiles')
    .select('profile_data')
    .eq('google_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[profile/route GET] Supabase fetch error:', error)
    return Response.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }

  console.log('[profile/route GET] Profile found:', data?.profile_data ? 'yes (setupComplete=' + data.profile_data.setupComplete + ')' : 'null')
  return Response.json({ profile: data?.profile_data ?? null })
}

export async function PUT(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      console.log('[profile/route PUT] Unauthorized — no session')
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let userId = (session.user as { id?: string }).id
    if (!userId) {
      console.log('[profile/route PUT] No user.id in session — trying internalUserId fallback')
      // Fallback: use internalUserId (profiles.id UUID) to look up google_id
      const internalUserId = (session as unknown as { internalUserId?: string }).internalUserId
      if (internalUserId) {
        const { data: fallbackProfile } = await supabase
          .from('profiles')
          .select('google_id')
          .eq('id', internalUserId)
          .maybeSingle()
        if (fallbackProfile?.google_id) {
          console.log('[profile/route PUT] Resolved google_id from internalUserId:', fallbackProfile.google_id)
          userId = fallbackProfile.google_id
        }
      }
      if (!userId) {
        console.log('[profile/route PUT] No user id in session')
        return Response.json({ error: 'No user id' }, { status: 400 })
      }
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      console.log('[profile/route PUT] Failed to parse request body')
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const profile = (body as { profile?: unknown })?.profile
    if (!profile || typeof profile !== 'object') {
      console.log('[profile/route PUT] Invalid profile data')
      return Response.json({ error: 'Invalid profile data' }, { status: 400 })
    }

    console.log('[profile/route PUT] Upserting profile for google_id:', userId, 'setupComplete:', (profile as { setupComplete?: boolean }).setupComplete)

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
      console.error('[profile/route PUT] Supabase upsert error:', error)
      // Include the upstream error detail so the client logs the real reason
      return Response.json({ error: 'Failed to save profile', detail: error.message ?? String(error) }, { status: 500 })
    }

    console.log('[profile/route PUT] Profile saved successfully for google_id:', userId)
    return Response.json({ success: true })
  } catch (err) {
    console.error('[profile/route PUT] Unhandled error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
