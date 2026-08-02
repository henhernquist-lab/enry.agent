/**
 * Server-side request body parsing.
 *
 * `await req.json()` throws a SyntaxError on any body that isn't valid JSON —
 * a truncated upload, a proxy that rewrote the body, a client bug, or a probe.
 * Thrown from a route handler that doesn't catch it, that SyntaxError escapes
 * to the framework, which answers with its own HTML error page and a 500.
 *
 * That is the raw-HTML-500 failure mode: the client then either chokes parsing
 * the HTML as JSON, or renders the markup as visible text. Guarding the parse
 * on the client (see lib/fetch-json) only softens the symptom — the route
 * should never have 500'd, because a malformed body is a *client* error.
 *
 * These helpers turn that into a clean 400 with a JSON body.
 */

/**
 * Parse a JSON request body without throwing. Returns `fallback` (default `{}`)
 * when the body is absent or unparseable, matching the `.catch(() => ({}))`
 * idiom already used by the routes that got this right.
 *
 * The generic defaults to `any` to match what `req.json()` itself returns —
 * this is a drop-in replacement, so it must not newly type-error the many
 * call sites that destructure the body directly. Pass an explicit type
 * argument to get real checking.
 */
export async function readRequestJson<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T = any,
>(req: Request, fallback: T = {} as T): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    return fallback
  }
}

/**
 * Strict variant: returns a discriminated result so a handler can reject a
 * malformed body with a 400 instead of silently treating it as empty. Use this
 * where an empty object would be indistinguishable from a valid request.
 */
export async function parseRequestJson<T = Record<string, unknown>>(
  req: Request,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  try {
    return { ok: true, data: (await req.json()) as T }
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: 'Malformed request body — expected valid JSON.' },
        { status: 400 },
      ),
    }
  }
}
