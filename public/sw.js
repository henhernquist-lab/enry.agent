// enry — service worker foundation for Web Push (Ambient Mode).
//
// Two jobs: (1) show a notification when a push arrives, (2) when the user
// clicks it, open/focus Learn's Chat tab at the due-probe deep link. There is
// no reply-via-push mechanism — the notification is a summons into the app,
// not a two-way channel. The actual probe/answer flow happens entirely in the
// page once opened, via the same in-app probe path every other probe uses.
//
// The payload-parsing and focus-or-open steps are named functions (not just
// inlined in the listeners) and exposed on `self` so an automated test can
// call the exact production logic directly — headless browser sandboxes
// can't actually display an OS notification to click, so this is the only
// way to exercise this code end-to-end outside a real device.

function parsePushPayload(event) {
  let payload = { title: 'enry', body: 'You have a notification.', data: {} }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Not JSON (or no body) — fall back to the default payload above.
  }
  return {
    title: payload.title,
    options: {
      body: payload.body,
      data: payload.data,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      // One tag = at most one visible Ambient notification at a time, same
      // spirit as the one-in-flight guard on the send side.
      tag: 'enry-ambient-probe',
    },
  }
}

async function focusOrOpen(targetUrl) {
  const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of allClients) {
    if ('focus' in client) {
      await client.focus()
      if ('navigate' in client) {
        try {
          await client.navigate(targetUrl)
          return
        } catch {
          // Some browsers restrict navigate() from a notificationclick
          // handler on an already-open client — fall through to opening a
          // fresh window instead.
        }
      }
    }
  }
  await self.clients.openWindow(targetUrl)
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const { title, options } = parsePushPayload(event)
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/learn?probe=1'
  event.waitUntil(focusOrOpen(targetUrl))
})

// Test-only seam — see file header. Real push/click handling above never
// calls through this; it's exposed purely so a verification script can
// invoke the exact production functions without a displayable notification.
self.__enryTestHooks = { parsePushPayload, focusOrOpen }
