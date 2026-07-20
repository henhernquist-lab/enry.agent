import { auth } from '@/lib/auth'
import { writeInput } from '@/lib/terminal/pty-manager'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface RouteCtx {
  params: Promise<{ id: string }>
}

// POST /api/terminal/pty/[id]/input — send keystrokes to the PTY.
export async function POST(req: Request, ctx: RouteCtx) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  let data = ''
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.data === 'string') data = body.data
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!data) return Response.json({ ok: true })

  const ok = writeInput(id, data)
  return Response.json({ ok })
}
