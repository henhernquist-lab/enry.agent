import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import {
  SCANFIX_CATEGORIES, DEFAULT_SCANFIX_CONFIG,
  type CruiseRepo, type ScanfixConfig, type CruiseScanfixCategory, type CruiseScanfixMode,
} from '@/lib/cruise/types'

export const maxDuration = 30

const MODES: CruiseScanfixMode[] = ['auto_fix', 'report_only', 'off']

// Persists a repo's scan-and-fix category config. Accepts a partial `categories`
// map to merge and an optional `buttons_autofix_confirmed` flag. Server-side
// hard rule: non_functional_buttons can't be 'auto_fix' unless the caller has
// confirmed it — the UI's per-repo opt-in — so a stray request can't silently
// enable button auto-fixing.
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const repoName = String(body.repo ?? '').trim()
  if (!repoName) return Response.json({ error: 'Missing repo' }, { status: 400 })

  const { data: repoRow } = await supabase
    .from('cruise_repos')
    .select('*')
    .eq('user_id', uid)
    .eq('full_name', repoName)
    .maybeSingle()
  const repo = repoRow as CruiseRepo | null
  if (!repo) return Response.json({ error: 'Cruise is not enabled for this repo.' }, { status: 403 })

  // Merge the incoming partial onto the current (or default) config, validating
  // every key + value.
  const current: ScanfixConfig = { ...DEFAULT_SCANFIX_CONFIG, ...(repo.scanfix_categories ?? {}) }
  const incoming = (body.categories ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(incoming)) {
    if (!SCANFIX_CATEGORIES.includes(k as CruiseScanfixCategory)) continue
    if (!MODES.includes(v as CruiseScanfixMode)) return Response.json({ error: `Invalid mode for ${k}` }, { status: 400 })
    current[k as CruiseScanfixCategory] = v as CruiseScanfixMode
  }

  const buttonsConfirmed = typeof body.buttons_autofix_confirmed === 'boolean'
    ? body.buttons_autofix_confirmed
    : repo.buttons_autofix_confirmed

  if (current.non_functional_buttons === 'auto_fix' && !buttonsConfirmed) {
    return Response.json({ error: 'Non-functional buttons auto-fix requires explicit confirmation.', code: 'buttons_unconfirmed' }, { status: 400 })
  }

  const { error } = await supabase
    .from('cruise_repos')
    .update({ scanfix_categories: current, buttons_autofix_confirmed: buttonsConfirmed, updated_at: new Date().toISOString() })
    .eq('id', repo.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true, scanfix_categories: current, buttons_autofix_confirmed: buttonsConfirmed })
}
