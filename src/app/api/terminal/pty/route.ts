import { auth } from '@/lib/auth'
import { createSession } from '@/lib/terminal/pty-manager'

export const runtime = 'nodejs'
// PTYs are long-lived; allow the create handler plenty of room (it returns
// immediately, but keep parity with the rest of the terminal routes).
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // auth() does real async work (Supabase lookups in the jwt callback for
  // edge cases like legacy tokens missing googleId) — wrapped so a genuine
  // auth-layer failure surfaces real detail too, not just a bare 500 that
  // bypasses the createSession error handling below entirely.
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

  try {
    const pty = await createSession({ cols, rows, cwd })
    return Response.json({ id: pty.id, cols: pty.cols, rows: pty.rows, cwd: pty.cwd })
  } catch (err) {
    // createSession rejects on failure (native addon didn't load, node-pty's
    // spawn() threw, etc.). Without this catch, Next's default handler
    // returns a bare 500 with no body — which is exactly what made this
    // undiagnosable from the client.
    const message = err instanceof Error ? err.message : String(err)
    console.error('[terminal/pty] createSession failed:', err)
    // Vercel's serverless functions can't hold a long-lived PTY process — if
    // this route ever runs there, node-pty's spawn() fails in a way that's
    // easy to mistake for a generic bug. Detect it and say so plainly instead
    // of surfacing a raw spawn error. VERCEL is set on every Vercel deploy
    // (build and runtime); absence of CODESPACES alone isn't a reliable
    // signal — it would also misfire on a plain local/laptop dev server.
    if (process.env.VERCEL) {
      return Response.json(
        { error: 'Terminal panes require the Codespace environment — real PTY shells cannot run on a serverless deployment.' },
        { status: 501 },
      )
    }
    return Response.json({ error: `Failed to start terminal: ${message}` }, { status: 500 })
  }
}
