// Per-user Infinite Campus credentials — save and check status.
// Credentials are encrypted with AES-256-GCM before storage.
// Never returns plaintext password to the client.

import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { encrypt } from '@/lib/crypto'

export const maxDuration = 15

// GET: check if the user has IC credentials saved (only returns label + has_credentials flag)
export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('user_credentials')
    .select('label, created_at, updated_at')
    .eq('user_id', uid)
    .eq('service', 'infinite_campus')
    .maybeSingle()

  return Response.json({
    has_credentials: Boolean(data),
    label: data?.label ?? null,
    created_at: data?.created_at ?? null,
    updated_at: data?.updated_at ?? null,
  })
}

// POST: save encrypted IC credentials
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const username = String(body.username ?? '').trim()
  const password = String(body.password ?? '').trim()

  if (!username || !password) {
    return Response.json({ error: 'Username and password are required' }, { status: 400 })
  }

  try {
    const encryptedUsername = encrypt(username)
    const encryptedPassword = encrypt(password)

    await supabase.from('user_credentials').upsert(
      {
        user_id: uid,
        service: 'infinite_campus',
        credential_a: encryptedUsername,
        credential_b: encryptedPassword,
        label: 'Infinite Campus',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,service' },
    )

    return Response.json({ success: true })
  } catch (e) {
    console.error('[ic-credentials] save failed:', e)
    return Response.json({ error: 'Failed to save credentials' }, { status: 500 })
  }
}

// DELETE: remove IC credentials
export async function DELETE() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase
    .from('user_credentials')
    .delete()
    .eq('user_id', uid)
    .eq('service', 'infinite_campus')

  return Response.json({ success: true })
}
