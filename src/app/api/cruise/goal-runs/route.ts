import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getDefaultBranch, dispatchGoalRun } from '@/lib/cruise/github-actions'
import { SEVERITY_RANK, type CruiseRepo, type CruiseGoalRun, type CruiseFinding } from '@/lib/cruise/types'

export const maxDuration = 30

const MAX_GOAL_LEN = 2000

// Turns a scan's findings into a fix-run plan: one step per file (fixing all of
// that file's findings in a single editor call is more coherent and respects the
// per-file cap). Files are ordered worst-severity-first so that if the cap trims
// the list, the most important files are fixed. Findings without a file can't be
// auto-fixed by an edit, so they're skipped.
function buildFixPlan(findings: CruiseFinding[], capFiles: number): { plan: string[]; goal: string; findingCount: number } {
  const byFile = new Map<string, CruiseFinding[]>()
  for (const f of findings) {
    if (!f.file_path) continue
    const arr = byFile.get(f.file_path) ?? []
    arr.push(f)
    byFile.set(f.file_path, arr)
  }
  const files = [...byFile.entries()]
    .sort((a, b) => Math.max(...b[1].map((f) => SEVERITY_RANK[f.severity])) - Math.max(...a[1].map((f) => SEVERITY_RANK[f.severity])))
    .slice(0, capFiles)
  const plan = files.map(([file, fs]) => {
    const items = fs
      .map((f) => `- [${f.severity}] ${f.title}${f.line_start ? ` (line ${f.line_start})` : ''}: ${f.detail}`.slice(0, 400))
      .join('\n')
    return `Fix ${fs.length} flagged issue(s) in ${file}:\n${items}`.slice(0, 1900)
  })
  const findingCount = files.reduce((n, [, fs]) => n + fs.length, 0)
  return { plan, goal: `Fix ${findingCount} scan finding(s) across ${files.length} file(s)`, findingCount }
}

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
  const scanId = typeof body.scan_id === 'string' ? body.scan_id : null
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

  // Two modes share this route. Fix mode (scan_id present): the plan is derived
  // from the scan's findings — the primary path. Goal mode (a natural-language
  // goal): the runner plans it itself — the advanced path.
  const mode: 'goal' | 'fix' = scanId ? 'fix' : 'goal'
  let goal: string
  let seedPlan: string[] | null = null

  if (mode === 'fix') {
    // Verify the scan belongs to this user's allowlisted repo.
    const { data: scan } = await supabase
      .from('cruise_scans')
      .select('id, repo_id, user_id')
      .eq('id', scanId!)
      .maybeSingle()
    if (!scan || scan.user_id !== uid || scan.repo_id !== repo.id) {
      return Response.json({ error: 'Scan not found for this repo.' }, { status: 404 })
    }
    const requestedIds: string[] | null = Array.isArray(body.finding_ids) ? body.finding_ids.filter((x: unknown) => typeof x === 'string') : null
    let q = supabase.from('cruise_findings').select('*').eq('scan_id', scanId!).eq('status', 'open')
    if (requestedIds && requestedIds.length > 0) q = q.in('id', requestedIds)
    const { data: findingRows } = await q
    const findings = (findingRows ?? []) as CruiseFinding[]
    if (findings.length === 0) return Response.json({ error: 'No open findings to fix.' }, { status: 400 })
    const built = buildFixPlan(findings, repo.goal_cap_files)
    if (built.plan.length === 0) return Response.json({ error: 'No file-scoped findings to fix.' }, { status: 400 })
    goal = built.goal
    seedPlan = built.plan
  } else {
    goal = String(body.goal ?? '').trim()
    if (!goal) return Response.json({ error: 'Missing goal' }, { status: 400 })
    if (goal.length > MAX_GOAL_LEN) return Response.json({ error: `Goal too long (max ${MAX_GOAL_LEN} chars)` }, { status: 400 })
  }

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
      mode,
      source_scan_id: scanId,
      status: 'queued',
      token_hash: tokenHash,
      // Bridges the session gap for the token-authed apply/finalize steps —
      // see the column comment in 009_cruise_goals.sql. Cleared on finalize.
      github_token: githubToken,
      branch_name: branchName,
      base_branch: defaultBranch,
      // Fix mode's plan is known up front (from findings); goal mode's is null
      // and the runner generates it. When plan is set the runner skips planning.
      plan: seedPlan,
      cap_files: repo.goal_cap_files,
      cap_steps: repo.goal_cap_steps,
    })
  if (insertErr) {
    if (insertErr.code === '23505') {
      return Response.json({ error: 'A goal run is already in progress for this repo.' }, { status: 409 })
    }
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  // Fix mode: seed the step rows now (goal mode seeds them from the runner's
  // 'plan' phase). The runner updates these by seq as it works each file.
  if (seedPlan) {
    await supabase
      .from('cruise_goal_steps')
      .insert(seedPlan.map((description, seq) => ({ goal_run_id: goalRunId, seq, description, status: 'pending' as const })))
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

  return Response.json({ goal_run_id: goalRunId, status: 'queued', branch: branchName, mode })
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
