import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { saveMemory } from '@/lib/memory'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const type = body.type === 'preference' ? 'preference' : 'memory'
  const prefix = type === 'preference' ? '[pref:communication] ' : ''

  const result = await saveMemory(session.user.id, prefix + body.content.trim())

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ id: result.id, type })
}
