import { auth } from './auth'
import { supabase } from './supabase'
import type { Session } from 'next-auth'

// Henry-only gate for endpoints that spawn real remote shell sandboxes.
//
// The app identifies Henry solely by `profiles.email === process.env.OWNER_EMAIL`
// (no role/is_admin/owner column exists — see migration 005 and the cron route
// `getOwnerGoogleId()` pattern in src/app/api/cron/daily-content/route.ts). Any
// endpoint that creates or drives a network-connected Linux VM must hard-gate on
// that identity, because anyone else reaching it would get remote code
// execution on compute billed to Henry — the single most important line of
// code in the cloud-terminals feature.
//
// This module is the canonical gate. Every cloud-terminal route calls
// `requireHenryOwner()` first and returns its Response on non-null.

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? ''

/**
 * Resolve Henry's `profiles.google_id` from `OWNER_EMAIL`.
 * Mirrors `getOwnerGoogleId()` in `src/app/api/cron/daily-content/route.ts:20`
 * exactly, so the two never drift.
 */
async function getOwnerGoogleId(): Promise<string | null> {
  if (!OWNER_EMAIL) return null
  const { data } = await supabase
    .from('profiles')
    .select('google_id')
    .eq('email', OWNER_EMAIL)
    .maybeSingle()
  return data?.google_id ?? null
}

export interface AuthOutcome {
  /** `null` if the caller may proceed; a Response to return immediately if not. */
  response: Response | null
  /** The verified-Henry session when `response` is null. */
  session: Session | null
}

/**
 * Hard-gate to Henry. Use at the top of every cloud-terminal route:
 *
 *   const gate = await requireHenryOwner()
 *   if (gate.response) return gate.response
 *   // gate.session is non-null and verified Henry here.
 *
 * Returns a Response (not throws) so the route handler keeps the same flat
 * `if (...) return` shape the rest of the codebase uses — auth failures are
 * expected outcomes, not exceptions.
 *
 * Failure modes (in order of precedence):
 *  - 401 — no session (not signed in)
 *  - 503 — OWNER_EMAIL unset or no profile row matches it (misconfigured;
 *          fails CLOSED — no cloud terminal is created until the env is fixed)
 *  - 403 — signed in but not Henry
 *
 * Comparing `profiles.google_id` (resolved from OWNER_EMAIL) against
 * `session.user.id` (= profiles.google_id, per auth.ts session callback) is
 * more tamper-proof than comparing session emails directly, since a user can
 * in principle mutate their own `profiles.email` row. The google_id is set by
 * the OAuth provider on sign-in and is the canonical identity token.
 */
export async function requireHenryOwner(): Promise<AuthOutcome> {
  let session
  try {
    session = await auth()
  } catch (err) {
    console.error('[auth-owner] auth() failed:', err)
    const message = err instanceof Error ? err.message : String(err)
    return {
      response: Response.json({ error: `Auth check failed: ${message}` }, { status: 500 }),
      session: null,
    }
  }

  if (!session?.user) {
    return {
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
    }
  }

  const ownerGoogleId = await getOwnerGoogleId()
  if (!ownerGoogleId) {
    // Fails closed: if OWNER_EMAIL isn't set or no profile matches, no cloud
    // terminal is spawned for ANYONE — including a potentially-Henry session
    // whose email hasn't been configured. Misconfiguration must NOT fall back
    // to permissive behavior.
    console.error('[auth-owner] OWNER_EMAIL unset or no profile matches — cloud terminals disabled')
    return {
      response: Response.json(
        { error: 'Cloud terminals not configured — OWNER_EMAIL is missing or resolves to no profile.' },
        { status: 503 },
      ),
      session: null,
    }
  }

  const sessionGoogleId = (session.user as { id?: string }).id
  if (!sessionGoogleId || sessionGoogleId !== ownerGoogleId) {
    console.warn('[auth-owner] rejected non-owner session: ', { sessionGoogleId })
    return {
      response: Response.json({ error: 'Forbidden — owner only' }, { status: 403 }),
      session: null,
    }
  }

  return { response: null, session }
}
