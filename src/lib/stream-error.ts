import { APICallError, TypeValidationError } from 'ai'
import { parseTpdExhaustion, formatRetryDelay } from '@/lib/usage/tpd'

// ───────────────────────────────────────────────────────────────────
// Never let a raw provider payload reach the chat UI as an "error". A naive
// `error instanceof Error ? error.message : ...` in a streamText onError
// callback leaks whatever the SDK put in .message — for a validation
// failure that's the entire rejected JSON object (provider internals,
// potentially sensitive fields). Real repro: Gemini's tool-call delta
// missing `index` produced a raw "Type validation failed: Value: {...}"
// dump in the chat window instead of a clean error.
//
// But one flat fallback string was its own problem: an out-of-credit
// provider, a rate limit, a bad key and a provider outage all rendered as
// the identical "Something went wrong processing that response.", which is
// undebuggable from the UI. Observed: OpenRouter's 402 message is 201
// characters — one over the raw-dump length threshold — so a plain
// out-of-credit error was indistinguishable from a corrupt payload.
//
// So: map the provider's HTTP status to a distinct, actionable, non-leaking
// message. The full error is always logged server-side regardless.
// ───────────────────────────────────────────────────────────────────

const MAX_USER_MESSAGE_LENGTH = 200

/** Heuristic: does this message look like it's carrying a raw payload dump
 *  rather than a short human-readable error? */
function looksLikeRawDump(message: string): boolean {
  return (
    message.length > MAX_USER_MESSAGE_LENGTH ||
    /Value:\s*[{[]/.test(message) || // zod/ai-sdk's "Value: {...}" dump marker
    /"choices"\s*:|"tool_calls"\s*:|"delta"\s*:/.test(message) // raw chunk JSON leaking through
  )
}

/**
 * Distinct user-facing message per provider failure class. Deliberately
 * written from the status code alone — never interpolating the provider's own
 * text, which can carry account ids, internal URLs, or quota details.
 */
/**
 * Pull the provider's raw response body out of an error, unwrapping the same
 * way extractStatus does. Used only to tell TPD apart from TPM — the body is
 * never echoed to the UI.
 */
function extractResponseBody(error: unknown, depth = 0): string | undefined {
  if (!error || typeof error !== 'object' || depth > 3) return undefined
  if (APICallError.isInstance(error) && error.responseBody) return error.responseBody

  const e = error as { cause?: unknown; lastError?: unknown; errors?: unknown }
  const nested: unknown[] = [
    e.lastError,
    ...(Array.isArray(e.errors) ? [e.errors[e.errors.length - 1]] : []),
    e.cause,
  ]
  for (const n of nested) {
    const b = extractResponseBody(n, depth + 1)
    if (b !== undefined) return b
  }
  return undefined
}

/**
 * Same per-status mapping the stream sanitizer uses, exported for plain
 * fetch() call sites (non-streaming API routes) so a 500 there gets the same
 * differentiated message instead of a second, drifting copy of this table.
 */
export function messageForStatus(status: number | undefined): string | null {
  if (status === undefined) return null
  if (status === 401 || status === 403) {
    return 'This model rejected Enry\'s API key — it\'s a configuration problem, not a temporary one. Check the provider key, or pick another model.'
  }
  if (status === 402) {
    return 'This model\'s provider account is out of credit. Top it up, or switch to another model.'
  }
  if (status === 404) {
    return 'The provider doesn\'t recognise this model — its model ID is probably wrong or has been retired.'
  }
  if (status === 408 || status === 504) {
    return 'The provider timed out. Try again, or switch to a faster model.'
  }
  if (status === 413) {
    // Groq returns 413 when prompt + reserved output exceeds the model's
    // tokens-per-minute allowance. "Try rephrasing" (the generic 4xx advice)
    // is actively wrong here — a one-word message triggers it just as easily,
    // because the size is dominated by the system prompt and tool schemas.
    return 'This request is too large for that model\'s per-minute limit. Try a shorter conversation, or switch to a model with more headroom.'
  }
  if (status === 429) {
    return 'Rate limited by the provider. Wait a few moments and try again, or switch models.'
  }
  if (status >= 500) {
    return 'This model is temporarily unavailable at the provider. Try again shortly, or switch models.'
  }
  if (status >= 400) {
    return 'The provider rejected this request. Try rephrasing, or switch models.'
  }
  return null
}

/**
 * Use as the `onError` callback for `streamText(...).toUIMessageStreamResponse()`.
 * Logs the real error (with `context` for grepping) and returns a short,
 * differentiated message that is safe to show in the UI.
 */
/**
 * Pull the provider status out of an error, including wrapped ones. The SDK
 * doesn't always hand back a bare APICallError: a retried call surfaces as
 * AI_RetryError carrying the real failures in `errors`/`lastError`, and other
 * layers wrap in `cause`. Without unwrapping, those all lose their status and
 * fall through to the flat "Something went wrong." — observed in practice.
 */
function extractStatus(error: unknown, depth = 0): number | undefined {
  if (!error || typeof error !== 'object' || depth > 3) return undefined
  if (APICallError.isInstance(error)) return error.statusCode

  const e = error as { cause?: unknown; lastError?: unknown; errors?: unknown }
  const nested: unknown[] = [
    e.lastError,
    ...(Array.isArray(e.errors) ? [e.errors[e.errors.length - 1]] : []),
    e.cause,
  ]
  for (const n of nested) {
    const s = extractStatus(n, depth + 1)
    if (s !== undefined) return s
  }
  return undefined
}

export function safeStreamErrorMessage(error: unknown, context: string): string {
  // Always log the whole thing server-side — the sanitizer hides detail from
  // the UI, never from the operator. Status is pulled out explicitly so it's
  // greppable in Vercel logs without expanding the object.
  const status = extractStatus(error)
  console.error(`[${context}]${status ? ` status=${status}` : ''}`, error)

  // TPD and TPM both surface as 429 but mean opposite things to the user: one
  // clears in seconds, the other has taken the model out for the rest of the
  // day. Collapsing them into "wait a few moments" sends Henry into a retry
  // loop against a budget that isn't coming back for hours.
  if (status === 429) {
    const tpd = parseTpdExhaustion(extractResponseBody(error))
    if (tpd) {
      console.error(`[${context}] TPD exhausted: used=${tpd.used}/${tpd.limit} requested=${tpd.requested}`)
      return `This model has used up its daily token allowance at the provider. It should free up ${formatRetryDelay(tpd.retryAfterSeconds)} — switch models to keep working.`
    }
  }

  if (TypeValidationError.isInstance(error)) {
    return 'The model returned a response in a format Golem couldn\'t process. Try again — if it keeps happening, this model may need a fix.'
  }

  const byStatus = messageForStatus(status)
  if (byStatus) return byStatus

  if (error instanceof Error) {
    if (looksLikeRawDump(error.message)) {
      return 'Something went wrong processing that response.'
    }
    return error.message
  }

  return 'Something went wrong.'
}
