import { auth } from '@/lib/auth'
import { writeInput as writeLocalInput } from '@/lib/terminal/pty-manager'
import { writeInput as writeSpriteInput, ensureWsLive } from '@/lib/terminal/sprite-manager'
import { requireHenryOwner } from '@/lib/auth-owner'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface RouteCtx {
  params: Promise<{ id: string }>
}

// POST /api/terminal/pty/[id]/input — send keystrokes to the terminal.
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

  let data = ''
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.data === 'string') data = body.data
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!data) return Response.json({ ok: true })

  // Cloud: WS may be down from a prior function cycle. Best-effort revive —
  // if it can't come back, return ok:false so the client knows the keystroke
  // was dropped (xterm.js local echo still shows it; the shell just didn't get it).
  if (onCloud) ensureWsLive(id)

  const ok = onCloud ? writeSpriteInput(id, data) : writeLocalInput(id, data)
  return Response.json({ ok })
}
