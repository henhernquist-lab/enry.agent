import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { getDefaultBranch, dispatchGoalRun } from '@/lib/cruise/github-actions'
import {
  SCANFIX_CATEGORIES, SCANFIX_LABEL, DEFAULT_SCANFIX_CONFIG,
  type CruiseRepo, type ScanfixConfig, type CruiseScanfixCategory, type CruiseGoalTrigger,
} from '@/lib/cruise/types'

// Deterministic broad fixes (a prettier reformat, an eslint --fix) legitimately
// touch many files, so a scanfix run gets a much higher file cap than an
// interactive edit would need. Still bounded, so a pathological run can't
// rewrite the whole repo unchecked.
export const SCANFIX_CAP_FILES = 200

// The enabled auto-fix categories from a full config, in canonical order. The
// runner filters identically (config[c]==='auto_fix'), so step seq aligns.
export function scanfixCats(config: ScanfixConfig): CruiseScanfixCategory[] {
  return SCANFIX_CATEGORIES.filter((c) => config[c] === 'auto_fix')
}

export type ScanfixDispatch =
  | { ok: true; goalRunId: string; branch: string }
  | { ok: false; skipped: boolean; reason: string; status: number }

// Creates + dispatches a scan-and-fix run — the sole actuator for category
// auto-fix (the open-ended natural-language goal input and the per-finding LLM
// fix mode were removed; this is the only mode this route ever creates). Used
// by both the interactive route (trigger 'on_demand') and the scheduled cron
// tick (trigger 'scheduled'), so concurrency/cap/branch/snapshot behaviour is
// identical for both.
//
// `autoFixCats` is the effective category set to fix this run. It's
// snapshotted onto the run as a full ScanfixConfig so a later repo-config
// change can't alter an in-flight run and so the runner (which reads
// ctx.scanfix_categories) fixes exactly this set.
export async function createScanfixRun(opts: {
  uid: string
  repo: CruiseRepo
  githubToken: string
  callbackBase: string
  autoFixCats: CruiseScanfixCategory[]
  trigger: CruiseGoalTrigger
}): Promise<ScanfixDispatch> {
  const { uid, repo, githubToken, callbackBase, autoFixCats, trigger } = opts
  if (autoFixCats.length === 0) return { ok: false, skipped: false, reason: 'No auto-fix categories are enabled for this repo.', status: 400 }

  const [owner, name] = repo.full_name.split('/')
  const { branch: defaultBranch, error: branchError } = await getDefaultBranch(githubToken, owner, name)
  if (branchError || !defaultBranch) return { ok: false, skipped: false, reason: `Could not resolve default branch: ${branchError ?? 'unknown'}`, status: 502 }

  // Reclaim a stalled run before it blocks this repo forever. The one-active-
  // run guard rejects a new run while any prior run is still active. If a
  // runner's job was killed (Actions timeout, OOM, a hung request) it never
  // posts finalize, so its row stays active with no fresh heartbeat. Any
  // active run whose last heartbeat (or dispatch, if it never checked in) is
  // older than the stale window is presumed dead and marked failed, so this
  // new run can take the slot.
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: activeRuns } = await supabase
    .from('cruise_goal_runs')
    .select('id, heartbeat_at, dispatched_at')
    .eq('repo_id', repo.id)
    .in('status', ['queued', 'planning', 'running', 'awaiting_clarification'])
  for (const r of activeRuns ?? []) {
    const last = (r.heartbeat_at ?? r.dispatched_at) as string
    if (last < staleCutoff) {
      await supabase
        .from('cruise_goal_runs')
        .update({ status: 'failed', error: 'Run stalled (no heartbeat) — reclaimed by a new run.', finished_at: new Date().toISOString(), github_token: null })
        .eq('id', r.id)
        .in('status', ['queued', 'planning', 'running'])
    }
  }

  // Full-config snapshot: exactly autoFixCats are 'auto_fix', the rest 'off'.
  const snapshot = { ...DEFAULT_SCANFIX_CONFIG } as ScanfixConfig
  for (const c of SCANFIX_CATEGORIES) snapshot[c] = autoFixCats.includes(c) ? 'auto_fix' : 'off'
  const seedPlan = autoFixCats.map((c) => `${SCANFIX_LABEL[c]} — deterministic auto-fix`)
  const goal = `Scan-and-fix: ${autoFixCats.length} categor${autoFixCats.length === 1 ? 'y' : 'ies'}`

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
      mode: 'scanfix',
      trigger,
      scanfix_categories: snapshot,
      status: 'queued',
      token_hash: tokenHash,
      // Bridges the session gap for the token-authed apply/finalize steps —
      // see the column comment in 009_cruise_goals.sql. Cleared on finalize.
      github_token: githubToken,
      branch_name: branchName,
      base_branch: defaultBranch,
      plan: seedPlan,
      cap_files: SCANFIX_CAP_FILES,
      cap_steps: repo.goal_cap_steps,
    })
  if (insertErr) {
    if (insertErr.code === '23505') return { ok: false, skipped: true, reason: 'A run is already in progress for this repo.', status: 409 }
    return { ok: false, skipped: false, reason: insertErr.message, status: 500 }
  }

  // Seed the step rows now — the runner updates these by seq as it fixes each
  // category. (No planning phase: the plan is known up front.)
  await supabase
    .from('cruise_goal_steps')
    .insert(seedPlan.map((description, seq) => ({ goal_run_id: goalRunId, seq, description, status: 'pending' as const })))

  const { ok, error: dispatchErr } = await dispatchGoalRun(githubToken, owner, name, defaultBranch, {
    goal_run_id: goalRunId,
    callback: callbackBase,
    token,
    branch: branchName,
    cap_files: String(SCANFIX_CAP_FILES),
    cap_steps: String(repo.goal_cap_steps),
  })
  if (!ok) {
    await supabase.from('cruise_goal_runs').update({ status: 'failed', error: dispatchErr, finished_at: new Date().toISOString() }).eq('id', goalRunId)
    return { ok: false, skipped: false, reason: dispatchErr ?? 'dispatch failed', status: 502 }
  }

  return { ok: true, goalRunId, branch: branchName }
}
