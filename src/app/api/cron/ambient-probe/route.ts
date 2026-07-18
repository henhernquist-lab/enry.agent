import { runAmbientTick } from '@/lib/learn/ambient'

// Ambient Mode cron tick. Mirrors cruise-tick's shape: a scheduler curls this
// with the CRON_SECRET bearer; it evaluates every user's ambient settings and
// sends at most one due probe each, respecting quiet hours + daily cap +
// one-in-flight. Scheduled by .github/workflows/enry-ambient-probe.yml (every
// ~15 min). Sending is credential-gated: with no Twilio env vars the send is a
// logged no-op, so the schedule is inert until creds are added.
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await runAmbientTick(new Date())
  console.log(`[cron/ambient-probe] evaluated ${result.evaluated}, sent ${result.sent}`)
  return Response.json({ ok: true, ...result })
}
