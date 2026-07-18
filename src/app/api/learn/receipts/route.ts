// Receipts API — contradiction ledger and resolution.

import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getReceiptLedger, resolveReceipt } from '@/lib/learn/receipts'

export const maxDuration = 30

export async function GET(_req: Request) {
  const session = await auth()
  const rawId = (session?.user as { id?: string })?.id ?? null
  const uid = await resolveResourceUserId(rawId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const receipts = await getReceiptLedger(uid)
    return Response.json({ receipts })
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
  const { event_id, resolution } = body

  if (!event_id || !resolution) {
    return Response.json({ error: 'event_id and resolution required' }, { status: 400 })
  }

  try {
    const result = await resolveReceipt(event_id, resolution)
    return Response.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
