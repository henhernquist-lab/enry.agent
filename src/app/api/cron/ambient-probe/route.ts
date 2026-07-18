import { runAmbientTick } from '@/lib/learn/ambient'

// Ambient Mode cron tick. Mirrors cruise-tick's shape: a scheduler curls this
// with the CRON_SECRET bearer; it evaluates every user's ambient settings and
// (stub-)sends at most one due probe each, respecting quiet hours + daily cap +
// one-in-flight. NOTHING SCHEDULES THIS YET — no GitHub Actions workflow entry
// was added (see OVERNIGHT.md [PAUSE]). The SMS send is a stub (no provider).
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await runAmbientTick(new Date())
  console.log(`[cron/ambient-probe] evaluated ${result.evaluated}, sent ${result.sent}`)
  return Response.json({ ok: true, ...result })
}
