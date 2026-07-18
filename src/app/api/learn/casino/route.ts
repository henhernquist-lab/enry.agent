// Confidence Casino API — balance, bets, calibration, wager actions.

import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { placeWager, resolveWager, getBalance, getRecentBets, getCalibration } from '@/lib/learn/casino'

export const maxDuration = 30

export async function GET(req: Request) {
  const session = await auth()
  const rawId = (session?.user as { id?: string })?.id ?? null
  const uid = await resolveResourceUserId(rawId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const action = url.searchParams.get('action') ?? 'balance'

  try {
    switch (action) {
      case 'balance':
        return Response.json({ balance: await getBalance(uid) })
      case 'bets':
        return Response.json({ bets: await getRecentBets(uid) })
      case 'calibration':
        return Response.json({ calibration: await getCalibration(uid) })
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  const rawId = (session?.user as { id?: string })?.id ?? null
  const uid = await resolveResourceUserId(rawId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const action = String(body.action ?? '')

  try {
    switch (action) {
      case 'place': {
        const result = await placeWager(body.claim_id, body.confidence, uid)
        return Response.json(result)
      }
      case 'resolve': {
        const result = await resolveWager(body.claim_id, body.was_correct)
        return Response.json(result)
      }
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
