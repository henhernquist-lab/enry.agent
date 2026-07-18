// Web Push subscription helpers — browser-only (called from client
// components). Registers public/sw.js, requests notification permission, and
// syncs the PushSubscription to /api/learn/ambient/push-subscribe.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (e) {
    console.error('[push] service worker registration failed:', e)
    return null
  }
}

export interface PushOpResult { ok: boolean; error?: string }

export async function subscribeToPush(): Promise<PushOpResult> {
  if (!pushSupported()) return { ok: false, error: 'unsupported' }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return { ok: false, error: 'no_vapid_key' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, error: 'permission_denied' }

  const registration = await registerServiceWorker()
  if (!registration) return { ok: false, error: 'sw_registration_failed' }
  await navigator.serviceWorker.ready

  let subscription: PushSubscription
  try {
    subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource }))
  } catch (e) {
    console.error('[push] subscribe failed:', e)
    return { ok: false, error: 'subscribe_failed' }
  }

  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { ok: false, error: 'bad_subscription' }

  const res = await fetch('/api/learn/ambient/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } } }),
  })
  if (!res.ok) return { ok: false, error: 'server_save_failed' }
  return { ok: true }
}

export async function unsubscribeFromPush(): Promise<PushOpResult> {
  try {
    if (pushSupported()) {
      const registration = await navigator.serviceWorker.getRegistration()
      const sub = await registration?.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
    }
  } catch (e) {
    console.error('[push] browser-side unsubscribe failed:', e)
  }
  await fetch('/api/learn/ambient/push-subscribe', { method: 'DELETE' })
  return { ok: true }
}
