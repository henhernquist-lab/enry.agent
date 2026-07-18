import { recordAmbientReply, verifyTwilioSignature } from '@/lib/learn/ambient'

// Inbound SMS reply webhook. Twilio POSTs the user's reply here (form-encoded
// From/Body). We record it into claim_events exactly like an in-app probe and
// advance next_probe_at.
//
// SECURITY: an unverified webhook would let anyone inject fake claim answers.
// Two accepted request shapes:
//   1. Real Twilio (application/x-www-form-urlencoded): REQUIRES a valid
//      X-Twilio-Signature (HMAC-SHA1 over the full URL + sorted params, keyed
//      by TWILIO_AUTH_TOKEN). Fails closed — no token, no signature → 403.
//   2. Local/test (application/json): guarded by ?token=CRON_SECRET. This path
//      never touches a real phone; it exists only to exercise reply parsing.
export const maxDuration = 30

// Reconstruct the exact URL Twilio signed. Prefer an explicit override (most
// robust behind proxies); otherwise derive from forwarded headers.
function signedUrl(req: Request): string {
  if (process.env.TWILIO_WEBHOOK_URL) return process.env.TWILIO_WEBHOOK_URL
  const url = new URL(req.url)
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host
  return `${proto}://${host}${url.pathname}${url.search}`
}

export async function POST(req: Request) {
  const ct = req.headers.get('content-type') ?? ''

  if (ct.includes('application/json')) {
    // Test path — token-guarded, no real phone involved.
    const secret = process.env.CRON_SECRET
    const url = new URL(req.url)
    if (!secret || url.searchParams.get('token') !== secret) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const j = await req.json().catch(() => ({}))
    const from = String(j.From ?? j.from ?? '')
    const body = String(j.Body ?? j.body ?? '')
    if (!from) return Response.json({ error: 'From required' }, { status: 400 })
    const result = await recordAmbientReply(from, body)
    return Response.json(result, { status: 200 })
  }

  // Real Twilio path — signature required.
  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: 'Bad request' }, { status: 400 })
  const params: Record<string, string> = {}
  for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : ''

  const signature = req.headers.get('x-twilio-signature')
  if (!verifyTwilioSignature(signedUrl(req), params, signature)) {
    return Response.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const from = String(params.From ?? '')
  const body = String(params.Body ?? '')
  if (!from) return Response.json({ error: 'From required' }, { status: 400 })

  const result = await recordAmbientReply(from, body)
  // 200 either way so Twilio doesn't retry-storm on an expected no-op.
  return Response.json(result, { status: 200 })
}
