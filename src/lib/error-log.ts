import { supabase } from '@/lib/supabase'
import { isTableMissing } from '@/lib/usage/log'

// Durable record of errors that reached an error boundary.
//
// The motivating failure: a Server Component threw in production and rendered
// a bare platform 500. Nothing was written anywhere the app could read — the
// only trace was in Vercel's runtime log, which needs a token to reach. So a
// user could report "500: This page couldn't load" and there was no way to
// find out which page or why.
//
// Same contract as logUsage: this must NEVER throw. It runs while the app is
// already in a failure state, and an error logger that raises turns a caught
// error into an uncaught one.

export type ErrorSource = 'server' | 'global' | 'client'

export interface AppErrorInput {
  userId?: string | null
  source?: ErrorSource
  digest?: string | null
  message?: string | null
  stack?: string | null
  pathname?: string | null
  userAgent?: string | null
}

/** Column caps, so one enormous stack can't bloat a row. */
const MAX_MESSAGE = 2000
const MAX_STACK = 8000

function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null
  const s = String(value)
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s
}

export async function logAppError(input: AppErrorInput): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('error_log')
      .insert({
        user_id: input.userId ?? null,
        source: input.source ?? 'server',
        digest: clip(input.digest, 200),
        message: clip(input.message, MAX_MESSAGE) ?? '',
        stack: clip(input.stack, MAX_STACK),
        pathname: clip(input.pathname, 500),
        user_agent: clip(input.userAgent, 500),
      })
      .select('id')
      .single()

    if (error) {
      // relation-not-exists is expected until the migration is applied —
      // don't spam the log with it.
      if (!isTableMissing(error)) {
        console.error('[error-log] insert failed:', error.message)
      }
      return null
    }
    return data?.id ?? null
  } catch (err) {
    console.error('[error-log] threw:', err)
    return null
  }
}
