import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { saveAmbientSettings } from '@/lib/learn/ambient'

// Web Push subscription register/unregister. Separate from the general
// settings route because the subscription object comes from the browser's
// PushManager, not a settings form. Stored in the same ambient-settings
// resources row (payload.push_subscription) — one row per user, consistent
// with how the rest of Ambient's config already lives.
export const maxDuration = 30

async function uidFrom(): Promise<string | null> {
  const session = await auth()
  const rawUserId = (session?.user as { id?: string } | undefined)?.id ?? null
  return resolveResourceUserId(rawUserId)
}

export async function POST(req: Request) {
  const uid = await uidFrom()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const sub = body?.subscription
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : null
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : null
  const authKey = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : null
  if (!endpoint || !p256dh || !authKey) {
    return Response.json({ error: 'subscription.{endpoint, keys.p256dh, keys.auth} required' }, { status: 400 })
  }

  const settings = await saveAmbientSettings(uid, { push_subscription: { endpoint, keys: { p256dh, auth: authKey } } })
  return Response.json({ ok: true, settings })
}

export async function DELETE() {
  const uid = await uidFrom()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const settings = await saveAmbientSettings(uid, { push_subscription: null })
  return Response.json({ ok: true, settings })
}
