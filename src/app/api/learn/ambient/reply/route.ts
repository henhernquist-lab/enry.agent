import { recordAmbientReply } from '@/lib/learn/ambient'

// Inbound SMS reply webhook. A provider (Twilio, etc.) would POST the user's
// reply here as form fields From/Body. We record it into claim_events exactly
// like an in-app probe answer and advance next_probe_at.
//
// GUARD: no provider is wired yet, so this is protected by a shared token
// (?token=CRON_SECRET) as a placeholder. A real deployment MUST replace this
// with the provider's request-signature verification (e.g. Twilio's
// X-Twilio-Signature) before exposing it publicly. Also accepts JSON for tests.
export const maxDuration = 30

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  if (!secret || url.searchParams.get('token') !== secret) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let from = ''
  let body = ''
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const j = await req.json().catch(() => ({}))
    from = String(j.From ?? j.from ?? '')
    body = String(j.Body ?? j.body ?? '')
  } else {
    const form = await req.formData().catch(() => null)
    from = String(form?.get('From') ?? '')
    body = String(form?.get('Body') ?? '')
  }
  if (!from) return Response.json({ error: 'From required' }, { status: 400 })

  const result = await recordAmbientReply(from, body)
  return Response.json(result, { status: result.ok ? 200 : 200 }) // 200 either way so the provider doesn't retry-storm
}
