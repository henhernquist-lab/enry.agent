import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { createScanfixRun, scanfixCats } from '@/lib/cruise/dispatch-scanfix'
import { DEFAULT_SCANFIX_CONFIG, type CruiseRepo, type CruiseGoalRun, type ScanfixConfig } from '@/lib/cruise/types'

export const maxDuration = 30

// Creates and dispatches a scan-and-fix run: enforces the allowlist
// server-side, then delegates to createScanfixRun (the actuator shared with
// the scheduled cron tick). This route only ever creates trigger='on_demand'
// runs — the open-ended natural-language goal input and per-finding LLM fix
// mode have been removed; category auto-fix is the only write path.
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!githubToken) return Response.json({ error: 'GitHub not connected.' }, { status: 400 })

  const callbackBase = process.env.NEXTAUTH_URL
  if (!callbackBase || callbackBase.includes('localhost')) {
    return Response.json({ error: 'Goal runs require a public callback URL (NEXTAUTH_URL). The GitHub runner cannot reach localhost.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const repoName = String(body.repo ?? '').trim()
  if (!repoName) return Response.json({ error: 'Missing repo' }, { status: 400 })

  const { data: repoRow, error: repoErr } = await supabase
    .from('cruise_repos')
    .select('*')
    .eq('user_id', uid)
    .eq('full_name', repoName)
    .maybeSingle()
  if (repoErr) return Response.json({ error: repoErr.message }, { status: 500 })
  const repo = repoRow as CruiseRepo | null
  if (!repo || !repo.enabled) return Response.json({ error: 'Cruise is not enabled for this repo.' }, { status: 403 })

  const config: ScanfixConfig = { ...DEFAULT_SCANFIX_CONFIG, ...(repo.scanfix_categories ?? {}) }
  const res = await createScanfixRun({ uid, repo, githubToken, callbackBase, autoFixCats: scanfixCats(config), trigger: 'on_demand' })
  if (!res.ok) return Response.json({ error: res.reason }, { status: res.status })
  return Response.json({ goal_run_id: res.goalRunId, status: 'queued', branch: res.branch, mode: 'scanfix' })
}

export async function GET(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const repoName = new URL(req.url).searchParams.get('repo')
  if (!repoName) return Response.json({ error: 'Missing repo' }, { status: 400 })

  const { data: repoRow } = await supabase
    .from('cruise_repos')
    .select('id')
    .eq('user_id', uid)
    .eq('full_name', repoName)
    .maybeSingle()
  if (!repoRow) return Response.json({ runs: [] })

  const { data, error } = await supabase
    .from('cruise_goal_runs')
    .select('*')
    .eq('repo_id', repoRow.id)
    .order('dispatched_at', { ascending: false })
    .limit(25)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ runs: (data ?? []) as CruiseGoalRun[] })
}
