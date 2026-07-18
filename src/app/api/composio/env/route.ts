import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'

// Composio env-wiring diagnostic.
// Returns which COMPOSIO_* env vars the deployed Vercel instance has set,
// without leaking their values (only `set: true/false` per name + the first
// 6 chars of any auth_config_id so two distinct env vars can be told apart).
// Auth-gated — the response itself is harmless but the endpoint's existence
// shouldn't be enumerable to anonymous traffic. The connect/route.ts catch
// already includes the auth_config_id it tried; this endpoint is the
// counterpart for "is the value even set in this env?".
export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const mask = (v: string | undefined): { set: boolean; preview: string | null } => {
    if (!v || v.trim().length === 0) return { set: false, preview: null }
    return { set: true, preview: v.trim().slice(0, 6) }
  }

  return Response.json({
    composio_api_key_present: !!process.env.COMPOSIO_API_KEY,
    auth_config_ids: {
      gmail: mask(process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID),
      googlecalendar: mask(process.env.COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID),
    },
    nextauth_url_present: !!process.env.NEXTAUTH_URL,
    nextauth_url_is_localhost: (process.env.NEXTAUTH_URL ?? '').includes('localhost'),
  })
}
