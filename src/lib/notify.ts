/**
 * ntfy.sh push notification helper.
 *
 * Sends a one-line push notification to Henry's phone via ntfy.sh.
 * Never throws — a failed notification silently logs and moves on.
 *
 * Setup (Henry, manual, one-time):
 *   1. Pick a private topic name
 *   2. Subscribe via the ntfy app on your phone
 *   3. Add NTFY_TOPIC=<topic> to Vercel production env vars
 *   4. Add NTFY_TOPIC as a GitHub Actions secret (for cron failure alerts)
 */

export async function notify(message: string): Promise<void> {
  const topic = process.env.NTFY_TOPIC
  if (!topic) return // no-op — notifications not configured

  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      body: message,
    })
  } catch (err) {
    // Never throw — a failed notification must not break the calling flow
    console.error('ntfy notify failed:', err)
  }
}
