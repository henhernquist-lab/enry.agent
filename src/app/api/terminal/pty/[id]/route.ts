import { auth } from '@/lib/auth'
import { getSession, getScrollback, subscribe, killSession } from '@/lib/terminal/pty-manager'

export const runtime = 'nodejs'
// SSE stream lives as long as the terminal pane is mounted.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

interface RouteCtx {
  params: Promise<{ id: string }>
}

// GET /api/terminal/pty/[id] — Server-Sent Events stream of PTY output.
// On connect, replays scrollback buffer, then streams live output. Keeps the
// PTY alive across SSE disconnects (reaper handles true orphans).
export async function GET(req: Request, ctx: RouteCtx) {
  const session = await auth()
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = await ctx.params
  const pty = getSession(id)
  if (!pty) {
    return new Response('Not found', { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: string) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          /* controller already closed */
        }
      }

      // Replay scrollback so reconnects (Strict Mode, tab-away) aren't blank.
      const backlog = getScrollback(id)
      if (backlog) send('output', backlog)

      const unsub = subscribe(
        id,
        (data) => send('output', data),
        (exitCode, signal) => send('exit', JSON.stringify({ exitCode, signal })),
      )

      // Heartbeat keeps the connection alive through proxies and lets the
      // client detect a dead server (no ping → reconnect).
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`))
        } catch {
          /* closed */
        }
      }, 15000)

      // Client disconnect — stop listening, but leave the PTY alive so a
      // quick reconnect (pane re-render) picks back up via scrollback.
      const cleanup = () => {
        clearInterval(ping)
        unsub()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      // req.signal is the AbortSignal for the client connection.
      if (req.signal.aborted) cleanup()
      req.signal.addEventListener('abort', cleanup, { once: true })
    },
    cancel() {
      // Stream consumer cancelled — cleanup happens via abort listener.
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable Next.js buffering/edge for this route.
      'X-Accel-Buffering': 'no',
    },
  })
}

// DELETE /api/terminal/pty/[id] — kill the PTY (close button).
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const ok = killSession(id)
  return Response.json({ ok })
}
