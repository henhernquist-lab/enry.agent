import { supabase } from '@/lib/supabase'
import { createScanfixRun } from '@/lib/cruise/dispatch-scanfix'
import { isScheduleDue, localParts } from '@/lib/cruise/schedule'
import { SCANFIX_CATEGORIES, type CruiseRepo, type CruiseScanfixCategory } from '@/lib/cruise/types'

export const maxDuration = 60

// The schedule tick. A GitHub Actions cron (enry-cruise-tick.yml, ~every 15 min)
// curls this with CRON_SECRET. For each repo with Auto-run enabled, evaluates the
// DST-safe schedule and, if due + under budget + not already running, dispatches
// a scheduled scanfix run via the same actuator (createScanfixRun) the
// interactive route uses. Best-effort per repo — one repo's failure never
// blocks the others. Never retries a failed run and never auto-merges.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const callbackBase = process.env.NEXTAUTH_URL
  if (!callbackBase || callbackBase.includes('localhost')) {
    return Response.json({ error: 'NEXTAUTH_URL must be a public URL for scheduled dispatch.' }, { status: 500 })
  }

  const now = new Date()
  const { data: repos } = await supabase
    .from('cruise_repos')
    .select('*')
    .eq('auto_run_enabled', true)
    .eq('enabled', true)
  const results: Array<{ repo: string; action: 'fired' | 'skipped' | 'error'; reason: string }> = []

  for (const row of (repos ?? []) as CruiseRepo[]) {
    const label = row.full_name
    try {
      const due = isScheduleDue(row, now)
      if (!due.due) { results.push({ repo: label, action: 'skipped', reason: due.reason }); continue }

      // Budget: per-repo monthly run cap. Reset the counter when the local month
      // rolls. This is the runaway-Actions-minutes guardrail.
      const localMonth = localParts(now, row.auto_run_tz!).date.slice(0, 7) // YYYY-MM
      const monthCount = row.auto_run_month === localMonth ? row.auto_run_month_count : 0
      if (monthCount >= row.auto_run_monthly_cap) {
        results.push({ repo: label, action: 'skipped', reason: `monthly cap reached (${row.auto_run_monthly_cap})` })
        continue
      }

      // Owner's persisted OAuth token (headless dispatch credential).
      const { data: profile } = await supabase.from('profiles').select('github_token').eq('id', row.user_id).maybeSingle()
      const githubToken = profile?.github_token as string | undefined
      if (!githubToken) { results.push({ repo: label, action: 'skipped', reason: 'no stored GitHub token — owner must sign in' }); continue }

      // Only the categories the user allowed for scheduled runs, intersected with
      // the valid set (belt-and-suspenders against a bad config row).
      const autoFixCats = (Array.isArray(row.auto_run_categories) ? row.auto_run_categories : [])
        .filter((c): c is CruiseScanfixCategory => SCANFIX_CATEGORIES.includes(c as CruiseScanfixCategory))
      if (autoFixCats.length === 0) { results.push({ repo: label, action: 'skipped', reason: 'no auto-run categories selected' }); continue }

      const localDate = localParts(now, row.auto_run_tz!).date

      const res = await createScanfixRun({ uid: row.user_id, repo: row, githubToken, callbackBase, autoFixCats, trigger: 'scheduled' })
      if (res.ok) {
        // Mark fired (dedup guard for the rest of the local day) + bump the
        // monthly counter. Only on a real dispatch.
        await supabase.from('cruise_repos').update({
          auto_run_last_fired_local_date: localDate,
          auto_run_month: localMonth,
          auto_run_month_count: monthCount + 1,
        }).eq('id', row.id)
        results.push({ repo: label, action: 'fired', reason: `run ${res.goalRunId}` })
      } else if (res.skipped) {
        // Concurrency: a run is already active for this repo — skip, don't queue,
        // and DON'T set last_fired (so it can fire later today once free).
        results.push({ repo: label, action: 'skipped', reason: res.reason })
      } else {
        results.push({ repo: label, action: 'error', reason: res.reason })
      }
    } catch (e) {
      console.error('[cron/cruise-tick] repo threw:', label, e)
      results.push({ repo: label, action: 'error', reason: String((e as Error)?.message ?? e) })
    }
  }

  const fired = results.filter((r) => r.action === 'fired').length
  console.log(`[cron/cruise-tick] evaluated ${results.length} repo(s), fired ${fired}`)
  return Response.json({ ok: true, evaluated: results.length, fired, results })
}
