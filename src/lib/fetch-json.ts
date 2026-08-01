import { messageForStatus } from '@/lib/stream-error'

// A non-2xx or non-JSON response (a Next.js error page, a platform 502, a
// proxy timeout page) must never be handed to JSON.parse or rendered as
// message text — it's an HTML document, and .json() throwing on it just
// trades one confusing failure for another.

/**
 * Parse a response body as JSON without throwing. Returns the parsed body
 * regardless of res.ok (our own routes return JSON error bodies like
 * `{ error: '...' }` on 4xx) — only a genuinely non-JSON body (HTML error
 * page, empty body) produces `data: null`, with a safe fallback message.
 */
export async function readJsonBody<T = unknown>(res: Response): Promise<{ data: T | null; fallbackMessage: string }> {
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      return { data: (await res.json()) as T, fallbackMessage: '' }
    } catch {
      return { data: null, fallbackMessage: 'The server returned an unreadable response.' }
    }
  }
  return { data: null, fallbackMessage: messageForStatus(res.status) ?? `Request failed (HTTP ${res.status})` }
}

/**
 * The common case: a route that returns `{ ...T }` on success and
 * `{ error?: string, message?: string }` on failure. Callers that need to
 * inspect the error body more specifically (a status/field-based branch)
 * should use readJsonBody directly instead.
 */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const { data, fallbackMessage } = await readJsonBody<T & { error?: unknown; message?: unknown }>(res)
  if (!res.ok) {
    const bodyMessage = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : undefined
    return { ok: false, message: bodyMessage ?? fallbackMessage ?? `Request failed (HTTP ${res.status})` }
  }
  if (data === null) return { ok: false, message: fallbackMessage || 'The server returned an unreadable response.' }
  return { ok: true, data: data as T }
}
