import { auth } from '@/lib/auth'
import { createSession as createLocalSession } from '@/lib/terminal/pty-manager'
import { createSession as createSpriteSession } from '@/lib/terminal/sprite-manager'
import { requireHenryOwner } from '@/lib/auth-owner'

export const runtime = 'nodejs'
// PTYs are long-lived; allow the create handler plenty of room (it returns
// immediately, but keep parity with the rest of the terminal routes).
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Vercel + SPRITES_TOKEN → cloud terminal path (Henry-only).
  // Codespace (no VERCEL) → local PTY path (any signed-in user, unchanged).
  const onCloud = !!process.env.VERCEL

  if (onCloud) {
    const gate = await requireHenryOwner()
    if (gate.response) return gate.response
  } else {
    let session
    try {
      session = await auth()
    } catch (err) {
      console.error('[terminal/pty] auth() failed:', err)
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ error: `Auth check failed: ${message}` }, { status: 500 })
    }
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
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

  if (onCloud) {
    if (!process.env.SPRITES_TOKEN) {
      console.error('[terminal/pty] VERCEL=1 but SPRITES_TOKEN unset — cloud terminals misconfigured')
      return Response.json(
        { error: 'Cloud terminals not configured — SPRITES_TOKEN is missing on the deployed app.' },
        { status: 503 },
      )
    }
    try {
      const pty = await createSpriteSession({ cols, rows, cwd })
      return Response.json({ id: pty.id, cols: pty.cols, rows: pty.rows, cwd: '' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[terminal/pty] createSpriteSession failed:', err)
      return Response.json({ error: `Failed to start cloud terminal: ${message}` }, { status: 500 })
    }
  }

  // Local path — unchanged Codespace behavior (node-pty, any signed-in user).
  try {
    const pty = await createLocalSession({ cols, rows, cwd })
    return Response.json({ id: pty.id, cols: pty.cols, rows: pty.rows, cwd: pty.cwd })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[terminal/pty] createLocalSession failed:', err)
    if (process.env.VERCEL) {
      return Response.json(
        { error: 'Terminal panes only run in the Codespace dev environment — not on the deployed app.' },
        { status: 501 },
      )
    }
    return Response.json({ error: `Failed to start terminal: ${message}` }, { status: 500 })
  }
}