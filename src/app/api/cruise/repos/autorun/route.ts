import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { localParts, parseHM } from '@/lib/cruise/schedule'
import { SCANFIX_CATEGORIES, type CruiseRepo, type CruiseScanfixCategory } from '@/lib/cruise/types'

export const maxDuration = 30

const FREQUENCIES = ['daily', 'weekly', 'every_n_days'] as const

function validTz(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

// Persists a repo's Auto-run schedule config. Validates the time/timezone/
// frequency and enforces the global "buttons never auto-fix without an explicit
// confirmation" invariant on the scheduled category set too.
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

  const enabled = body.enabled === true
  const patch: Record<string, unknown> = { auto_run_enabled: enabled, updated_at: new Date().toISOString() }

  // A full config is only required when turning Auto-run on.
  if (enabled) {
    const time = String(body.time ?? '')
    if (parseHM(time) == null) return Response.json({ error: 'Invalid time (expected HH:MM).' }, { status: 400 })
    const tz = String(body.tz ?? '')
    if (!tz || !validTz(tz)) return Response.json({ error: 'Invalid timezone.' }, { status: 400 })
    const frequency = String(body.frequency ?? '')
    if (!FREQUENCIES.includes(frequency as typeof FREQUENCIES[number])) return Response.json({ error: 'Invalid frequency.' }, { status: 400 })

    let weekday: number | null = null
    let interval: number | null = null
    if (frequency === 'weekly') {
      weekday = Number(body.weekday)
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return Response.json({ error: 'Invalid weekday (0–6).' }, { status: 400 })
    }
    if (frequency === 'every_n_days') {
      interval = Number(body.interval_days)
      if (!Number.isInteger(interval) || interval < 1 || interval > 60) return Response.json({ error: 'Invalid interval (1–60 days).' }, { status: 400 })
    }

    const rawCats = Array.isArray(body.categories) ? body.categories : []
    const categories = rawCats.filter((c: unknown): c is CruiseScanfixCategory => SCANFIX_CATEGORIES.includes(c as CruiseScanfixCategory))
    if (categories.length === 0) return Response.json({ error: 'Select at least one category for scheduled runs.' }, { status: 400 })
    if (categories.includes('non_functional_buttons') && !repo.buttons_autofix_confirmed) {
      return Response.json({ error: 'Non-functional buttons auto-fix requires confirmation first.', code: 'buttons_unconfirmed' }, { status: 400 })
    }

    const monthlyCap = Number.isInteger(body.monthly_cap) && body.monthly_cap > 0 ? Math.min(body.monthly_cap, 500) : repo.auto_run_monthly_cap

    patch.auto_run_time = time
    patch.auto_run_tz = tz
    patch.auto_run_frequency = frequency
    patch.auto_run_weekday = weekday
    patch.auto_run_interval_days = interval
    patch.auto_run_categories = categories
    patch.auto_run_monthly_cap = monthlyCap
    // Anchor every-N-days counting at today (local). Also reset the last-fired
    // guard so a fresh schedule can fire its first occurrence today if it's still
    // ahead — but not re-fire a slot already passed (isScheduleDue handles that).
    patch.auto_run_anchor_date = localParts(new Date(), tz).date
    patch.auto_run_last_fired_local_date = null
  }

  const { error } = await supabase.from('cruise_repos').update(patch).eq('id', repo.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
