import { TypeValidationError } from 'ai'

// ───────────────────────────────────────────────────────────────────
// Never let a raw provider payload reach the chat UI as an "error". A naive
// `error instanceof Error ? error.message : ...` in a streamText onError
// callback leaks whatever the SDK put in .message — for a validation
// failure that's the entire rejected JSON object (provider internals,
// potentially sensitive fields). Real repro: Gemini's tool-call delta
// missing `index` produced a raw "Type validation failed: Value: {...}"
// dump in the chat window instead of a clean error.
//
// This always logs the full error server-side (for debugging) and returns
// a short, generic, user-safe string for the stream.
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
 * Use as the `onError` callback for `streamText(...).toUIMessageStreamResponse()`.
 * Logs the real error (with `context` for grepping) and returns a short,
 * generic message safe to show in the UI.
 */
export function safeStreamErrorMessage(error: unknown, context: string): string {
  console.error(`[${context}]`, error)

  if (TypeValidationError.isInstance(error)) {
    return 'The model returned a response in a format Enry couldn\'t process. Try again — if it keeps happening, this model may need a fix.'
  }

  if (error instanceof Error) {
    if (looksLikeRawDump(error.message)) {
      return 'Something went wrong processing that response.'
    }
    return error.message
  }

  return 'Something went wrong.'
}
