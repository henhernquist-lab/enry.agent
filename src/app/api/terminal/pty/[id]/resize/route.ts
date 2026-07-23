import { auth } from '@/lib/auth'
import { resizeSession as resizeLocalSession } from '@/lib/terminal/pty-manager'
import { resizeSession as resizeSpriteSession, ensureWsLive } from '@/lib/terminal/sprite-manager'
import { requireHenryOwner } from '@/lib/auth-owner'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface RouteCtx {
  params: Promise<{ id: string }>
}

// POST /api/terminal/pty/[id]/resize — resize the terminal (cols × rows).
// Codespace → local PTY. Vercel → Sprites WS (requires Henry).
export async function POST(req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params

  const onCloud = !!process.env.VERCEL
  if (onCloud) {
    const gate = await requireHenryOwner()
    if (gate.response) return gate.response
  } else {
    const session = await auth()
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let cols = 80
  let rows = 24
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.cols === 'number') cols = body.cols
    if (typeof body?.rows === 'number') rows = body.rows
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (onCloud) ensureWsLive(id)

  const ok = onCloud ? resizeSpriteSession(id, cols, rows) : resizeLocalSession(id, cols, rows)
  return Response.json({ ok })
}