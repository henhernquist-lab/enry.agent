import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import type { CruiseRepo, CruiseGoalRunStatus } from '@/lib/cruise/types'

export const maxDuration = 30

// GET /api/cruise/autos — read-only aggregator powering enry-lite's Status tab.
// Returns one row per cruise_repos entry the user owns, joined with the latest
// cruise_goal_runs row for that repo. Two-shot read instead of N+1: fetch all
// repos, fetch latest runs across all repos in one IN() query, dedupe in-memory.
// Fields are intentionally a subset of the full Cruise rows — only what the
// mobile card and bottom sheet consume. No fancy joins; both reads are
// session-authed like the rest of /api/cruise/*.

export interface CruiseAutoView {
  id: string
  full_name: string
  enabled: boolean
  buttons_autofix_confirmed: boolean
  scanfix_categories: Record<string, string> | null

  // Auto-run config — every field the form needs to round-trip.
  auto_run_enabled: boolean
  auto_run_time: string | null
  auto_run_tz: string | null
  auto_run_frequency: 'daily' | 'weekly' | 'every_n_days' | null
  auto_run_weekday: number | null
  auto_run_interval_days: number | null
  auto_run_anchor_date: string | null
  auto_run_categories: string[] | null
  auto_run_last_fired_local_date: string | null
  auto_run_monthly_cap: number
  auto_run_month: string | null
  auto_run_month_count: number

  // Latest run summary, embedded so the card paints without a second fetch.
  latest_run: {
    id: string
    status: CruiseGoalRunStatus
    branch_name: string
    pr_url: string | null
    pr_number: number | null
    error: string | null
    remaining_summary: string | null
    dispatched_at: string
    heartbeat_at: string | null
    finished_at: string | null
    trigger: 'on_demand' | 'scheduled' | null
  } | null
}

export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // 1. Pull every cruise_repos row the user owns. We DO NOT filter by enabled —
  // mobile-status is also the path for surfacing disabled repos so the user can
  // re-enable them from the sheet. Order matches the existing /api/cruise/repos
  // listing so the order doesn't surprise anyone used to desktop.
  const { data: repos, error: reposErr } = await supabase
    .from('cruise_repos')
    .select('*')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false })
  if (reposErr) return Response.json({ error: reposErr.message }, { status: 500 })

  const repoList = (repos ?? []) as CruiseRepo[]
  const repoIds = repoList.map((r) => r.id)

  // 2. Pull the latest cruise_goal_runs per repo in a single IN() query. We
  // over-fetch (cap 200) just in case a single user has many repos times many
  // runs; dedupe picks the newest per repo. Repos with zero runs simply have
  // no row, which surfaces as latest_run: null on the mobile card.
  let latestByRepo = new Map<string, CruiseAutoView['latest_run']>()
  if (repoIds.length > 0) {
    const { data: runs, error: runsErr } = await supabase
      .from('cruise_goal_runs')
      .select('id, repo_id, status, branch_name, pr_url, pr_number, error, remaining_summary, dispatched_at, heartbeat_at, finished_at, trigger')
      .in('repo_id', repoIds)
      .order('dispatched_at', { ascending: false })
      .limit(200)
    if (runsErr) return Response.json({ error: runsErr.message }, { status: 500 })

    for (const run of (runs ?? []) as Array<Record<string, unknown>>) {
      const repoId = String(run.repo_id ?? '')
      if (!repoId || latestByRepo.has(repoId)) continue
      latestByRepo.set(repoId, {
        id: String(run.id),
        status: run.status as CruiseGoalRunStatus,
        branch_name: String(run.branch_name ?? ''),
        pr_url: (run.pr_url as string | null) ?? null,
        pr_number: (run.pr_number as number | null) ?? null,
        error: (run.error as string | null) ?? null,
        remaining_summary: (run.remaining_summary as string | null) ?? null,
        dispatched_at: String(run.dispatched_at ?? ''),
        heartbeat_at: (run.heartbeat_at as string | null) ?? null,
        finished_at: (run.finished_at as string | null) ?? null,
        trigger: (run.trigger as 'on_demand' | 'scheduled' | null) ?? null,
      })
    }
  }

  // 3. Reshape to the mobile-friendly CruiseAutoView. Drop discriminator fields
  // the card doesn't render but the autorun form does need; pass-through the
  // schedule config wholesale so the sheet can round-trip without a refetch.
  const shaped: CruiseAutoView[] = repoList.map((r) => {
    const view: CruiseAutoView = {
      id: r.id,
      full_name: r.full_name,
      enabled: Boolean(r.enabled),
      buttons_autofix_confirmed: Boolean(r.buttons_autofix_confirmed),
      scanfix_categories: (r.scanfix_categories as Record<string, string> | null) ?? null,
      auto_run_enabled: Boolean(r.auto_run_enabled),
      auto_run_time: r.auto_run_time ?? null,
      auto_run_tz: r.auto_run_tz ?? null,
      auto_run_frequency: (r.auto_run_frequency as CruiseAutoView['auto_run_frequency']) ?? null,
      auto_run_weekday: r.auto_run_weekday ?? null,
      auto_run_interval_days: r.auto_run_interval_days ?? null,
      auto_run_anchor_date: r.auto_run_anchor_date ?? null,
      auto_run_categories: (r.auto_run_categories as string[] | null) ?? null,
      auto_run_last_fired_local_date: r.auto_run_last_fired_local_date ?? null,
      auto_run_monthly_cap: typeof r.auto_run_monthly_cap === 'number' ? r.auto_run_monthly_cap : 30,
      auto_run_month: r.auto_run_month ?? null,
      auto_run_month_count: typeof r.auto_run_month_count === 'number' ? r.auto_run_month_count : 0,
      latest_run: latestByRepo.get(r.id) ?? null,
    }
    return view
  })

  return Response.json({ repos: shaped })
}
