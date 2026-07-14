import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getDefaultBranch, dispatchGoalRun } from '@/lib/cruise/github-actions'
import type { CruiseRepo, CruiseGoalRun } from '@/lib/cruise/types'

export const maxDuration = 30

const MAX_GOAL_LEN = 2000

// Creates and dispatches a goal run: enforces the allowlist server-side,
// mints a per-run callback token, resolves the branch name up front (so it's
// known before the first dispatch), then fires the goal workflow. Mirrors
// /api/cruise/scan's shape closely — see that route for the established
// pattern this follows.
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
  const goal = String(body.goal ?? '').trim()
  if (!repoName) return Response.json({ error: 'Missing repo' }, { status: 400 })
  if (!goal) return Response.json({ error: 'Missing goal' }, { status: 400 })
  if (goal.length > MAX_GOAL_LEN) return Response.json({ error: `Goal too long (max ${MAX_GOAL_LEN} chars)` }, { status: 400 })

  const { data: repoRow, error: repoErr } = await supabase
    .from('cruise_repos')
    .select('*')
    .eq('user_id', uid)
    .eq('full_name', repoName)
    .maybeSingle()
  if (repoErr) return Response.json({ error: repoErr.message }, { status: 500 })
  const repo = repoRow as CruiseRepo | null
  if (!repo || !repo.enabled) return Response.json({ error: 'Cruise is not enabled for this repo.' }, { status: 403 })

  const [owner, name] = repoName.split('/')
  const { branch: defaultBranch, error: branchError } = await getDefaultBranch(githubToken, owner, name)
  if (branchError || !defaultBranch) return Response.json({ error: `Could not resolve default branch: ${branchError ?? 'unknown'}` }, { status: 502 })

  // Reclaim a stalled run before it blocks this repo forever. The one-active-
  // run guard rejects a new run while any prior run is still 'queued'/'running'/
  // etc. If a runner's job was killed (the 45-min Actions timeout, an OOM, a
  // hung request) it never posts finalize, so its row stays active with no
  // fresh heartbeat. Any active run whose last heartbeat (or dispatch, if it
  // never checked in) is older than the stale window is presumed dead and
  // marked failed, so this new run can take the slot.
  const STALE_MS = 15 * 60 * 1000
  const staleCutoff = new Date(Date.now() - STALE_MS).toISOString()
  const { data: activeRuns } = await supabase
    .from('cruise_goal_runs')
    .select('id, heartbeat_at, dispatched_at')
    .eq('repo_id', repo.id)
    .in('status', ['queued', 'planning', 'running', 'awaiting_clarification'])
  for (const r of activeRuns ?? []) {
    // awaiting_clarification is a legit paused state (waiting on the user), not
    // stale — leave it. Everything else is reclaimable once the heartbeat ages out.
    const last = (r.heartbeat_at ?? r.dispatched_at) as string
    if (last < staleCutoff) {
      await supabase
        .from('cruise_goal_runs')
        .update({ status: 'failed', error: 'Run stalled (no heartbeat) — reclaimed by a new run.', finished_at: new Date().toISOString(), github_token: null })
        .eq('id', r.id)
        .in('status', ['queued', 'planning', 'running']) // don't clobber a paused/clarification run
    }
  }

  const goalRunId = randomUUID()
  const branchName = `enry-cruise/goal-${goalRunId}`
  const token = randomBytes(24).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  // Insert first so the runner's callback always finds a row. The partial
  // unique index (one live goal run per repo) rejects a second concurrent run.
  const { error: insertErr } = await supabase
    .from('cruise_goal_runs')
    .insert({
      id: goalRunId,
      repo_id: repo.id,
      user_id: uid,
      goal,
      status: 'queued',
      token_hash: tokenHash,
      // Bridges the session gap for the token-authed apply/finalize steps —
      // see the column comment in 009_cruise_goals.sql. Cleared on finalize.
      github_token: githubToken,
      branch_name: branchName,
      base_branch: defaultBranch,
      cap_files: repo.goal_cap_files,
      cap_steps: repo.goal_cap_steps,
    })
  if (insertErr) {
    if (insertErr.code === '23505') {
      return Response.json({ error: 'A goal run is already in progress for this repo.' }, { status: 409 })
    }
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  const { ok, error: dispatchErr } = await dispatchGoalRun(githubToken, owner, name, defaultBranch, {
    goal_run_id: goalRunId,
    callback: callbackBase,
    token,
    branch: branchName,
    cap_files: String(repo.goal_cap_files),
    cap_steps: String(repo.goal_cap_steps),
  })
  if (!ok) {
    await supabase.from('cruise_goal_runs').update({ status: 'failed', error: dispatchErr, finished_at: new Date().toISOString() }).eq('id', goalRunId)
    return Response.json({ error: dispatchErr }, { status: 502 })
  }

  return Response.json({ goal_run_id: goalRunId, status: 'queued', branch: branchName })
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
