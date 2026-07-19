import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { nextRun } from '@/lib/cruise/schedule'
import type { AutoRunConfig, CruiseGoalRun, CruiseRepo } from '@/lib/cruise/types'

export const maxDuration = 30

// Thin read-only aggregator for enry lite's Cruise Auto-run status card
// (src/app/m/status/page.tsx). Reads cruise_repos (the auto_run_* columns
// desktop's AutoRunPanel already writes via /api/cruise/repos/autorun) plus
// each repo's latest cruise_goal_runs row, and shapes both into one job per
// repo. No new tables, no caching — rebuilt fresh on every call; for a status
// page, staleness is worse than the round trip.
export interface CruiseAutoJob {
  repo: string
  auto_run: AutoRunConfig
  buttons_autofix_confirmed: boolean
  next_run_at: string | null // ISO, computed server-side via nextRun()
  latest_run: {
    id: string
    status: CruiseGoalRun['status']
    branch_name: string
    pr_url: string | null
    dispatched_at: string
    heartbeat_at: string | null
    finished_at: string | null
  } | null
}

export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: repoRows, error: repoErr } = await supabase
    .from('cruise_repos')
    .select('*')
    .eq('user_id', uid)
    .eq('enabled', true)
    .order('updated_at', { ascending: false })
  if (repoErr) return Response.json({ error: repoErr.message }, { status: 500 })

  const repos = (repoRows ?? []) as CruiseRepo[]
  if (repos.length === 0) return Response.json({ jobs: [] })

  const repoIds = repos.map((r) => r.id)
  // Single round trip for every repo's runs, newest first — then take the
  // first occurrence per repo_id in JS rather than a per-repo query or a
  // window-function RPC (no schema changes for this route).
  const { data: runRows, error: runErr } = await supabase
    .from('cruise_goal_runs')
    .select('id, repo_id, status, branch_name, pr_url, dispatched_at, heartbeat_at, finished_at')
    .in('repo_id', repoIds)
    .order('dispatched_at', { ascending: false })
    .limit(repoIds.length * 10)
  if (runErr) return Response.json({ error: runErr.message }, { status: 500 })

  const latestByRepoId = new Map<string, (typeof runRows)[number]>()
  for (const row of runRows ?? []) {
    if (!latestByRepoId.has(row.repo_id)) latestByRepoId.set(row.repo_id, row)
  }

  const now = new Date()
  const jobs: CruiseAutoJob[] = repos.map((r) => {
    const latest = latestByRepoId.get(r.id)
    return {
      repo: r.full_name,
      auto_run: {
        auto_run_enabled: r.auto_run_enabled,
        auto_run_time: r.auto_run_time,
        auto_run_tz: r.auto_run_tz,
        auto_run_frequency: r.auto_run_frequency,
        auto_run_weekday: r.auto_run_weekday,
        auto_run_interval_days: r.auto_run_interval_days,
        auto_run_anchor_date: r.auto_run_anchor_date,
        auto_run_categories: r.auto_run_categories,
        auto_run_last_fired_local_date: r.auto_run_last_fired_local_date,
        auto_run_monthly_cap: r.auto_run_monthly_cap,
        auto_run_month: r.auto_run_month,
        auto_run_month_count: r.auto_run_month_count,
      },
      buttons_autofix_confirmed: r.buttons_autofix_confirmed,
      next_run_at: nextRun(r, now)?.toISOString() ?? null,
      latest_run: latest
        ? {
            id: latest.id,
            status: latest.status,
            branch_name: latest.branch_name,
            pr_url: latest.pr_url,
            dispatched_at: latest.dispatched_at,
            heartbeat_at: latest.heartbeat_at,
            finished_at: latest.finished_at,
          }
        : null,
    }
  })

  return Response.json({ jobs })
}
