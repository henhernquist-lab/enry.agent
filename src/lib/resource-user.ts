import { supabase } from './supabase'

// resources.user_id is uuid (references profiles.id).
//
// Two possible inputs:
//   - Old sessions: session.user.id = raw google_id (text, e.g. Google "sub")
//   - New sessions: session.user.id = profiles.id UUID (resolved in JWT callback)
//
// This resolver handles both transparently. If the input looks like a UUID
// (36-char hex-dashed), try it directly as profiles.id first. Otherwise treat
// it as a google_id and look up the matching UUID.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function resolveResourceUserId(id: string | null): Promise<string | null> {
  if (!id) return null

  // Fast path: input is already a UUID → verify it exists in profiles
  if (UUID_RE.test(id)) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (data) return data.id
  }

  // Slow path: input is a provider account ID → resolve to UUID
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('google_id', id)
    .maybeSingle()

  if (error) {
    console.error('[resource-user] profile lookup failed:', error)
    return null
  }

  return data?.id ?? null
}
