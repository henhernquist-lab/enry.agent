import { auth } from '@/lib/auth'
import { createSession } from '@/lib/terminal/pty-manager'

export const runtime = 'nodejs'
// PTYs are long-lived; allow the create handler plenty of room (it returns
// immediately, but keep parity with the rest of the terminal routes).
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let cols = 80
  let rows = 24
  let cwd: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.cols === 'number') cols = body.cols
    if (typeof body?.rows === 'number') rows = body.rows
    if (typeof body?.cwd === 'string' && body.cwd) cwd = body.cwd
  } catch {
    /* empty body is fine */
  }

  const pty = createSession({ cols, rows, cwd })
  return Response.json({ id: pty.id, cols: pty.cols, rows: pty.rows, cwd: pty.cwd })
}
