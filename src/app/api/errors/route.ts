import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { logAppError, type ErrorSource } from '@/lib/error-log'

export const maxDuration = 10

const SOURCES: ReadonlySet<string> = new Set(['server', 'global', 'client'])

/**
 * Sink for the error boundaries.
 *
 * Error boundaries are client components, so they can't reach Supabase
 * directly — they post here instead.
 *
 * Deliberately NOT auth-gated. A root layout can throw before a session
 * resolves, and the login page renders outside auth entirely; those are
 * exactly the errors that were invisible before, so rejecting them
 * unauthenticated would preserve the blind spot. The session is read when
 * present and the row attributed, but a missing one is not an error.
 *
 * Always answers 200. This is called from a page that has already failed —
 * a non-OK response here would put the boundary itself into a failure path.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      source?: string
      digest?: string
      message?: string
      stack?: string
      pathname?: string
    } | null

    if (!body) return Response.json({ ok: false }, { status: 200 })

    let userId: string | null = null
    try {
      const session = await auth()
      const googleId = (session?.user as { id?: string })?.id
      userId = await resolveResourceUserId(googleId ?? null)
    } catch {
      /* unauthenticated, or auth itself is what broke — still worth recording */
    }

    const source = SOURCES.has(body.source ?? '') ? (body.source as ErrorSource) : 'client'

    const id = await logAppError({
      userId,
      source,
      digest: body.digest,
      message: body.message,
      stack: body.stack,
      pathname: body.pathname,
      userAgent: req.headers.get('user-agent'),
    })

    return Response.json({ ok: true, id }, { status: 200 })
  } catch (e) {
    console.error('[api/errors] failed:', e)
    return Response.json({ ok: false }, { status: 200 })
  }
}
