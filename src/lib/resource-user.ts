import { supabase } from './supabase'

// resources.user_id is uuid (references profiles.id). Session carries the
// provider's raw google_id (text, e.g. a Google account sub) as session.user.id
// — that string is never valid uuid syntax, so it must be resolved to the
// matching profiles.id row before use in any resources.user_id query.
export async function resolveResourceUserId(googleId: string | null): Promise<string | null> {
  if (!googleId) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('google_id', googleId)
    .maybeSingle()

  if (error) {
    console.error('[resource-user] profile lookup failed:', error)
    return null
  }

  return data?.id ?? null
}
