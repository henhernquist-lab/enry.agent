import { auth } from '@/lib/auth'
import { resizeSession } from '@/lib/terminal/pty-manager'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface RouteCtx {
  params: Promise<{ id: string }>
}

// POST /api/terminal/pty/[id]/resize — resize the PTY (cols × rows).
export async function POST(req: Request, ctx: RouteCtx) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  let cols = 80
  let rows = 24
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.cols === 'number') cols = body.cols
    if (typeof body?.rows === 'number') rows = body.rows
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const ok = resizeSession(id, cols, rows)
  return Response.json({ ok })
}
