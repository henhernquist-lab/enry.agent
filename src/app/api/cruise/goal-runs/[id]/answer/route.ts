import { randomBytes, createHash } from 'node:crypto'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { dispatchGoalRun } from '@/lib/cruise/github-actions'

export const maxDuration = 30

const MAX_ANSWER_LEN = 2000

// Answers a pending clarifying question and resumes the run: mints a fresh
// callback token (the old one died with the paused dispatch), refreshes the
// github_token bridge from the current session, and fires a new
// workflow_dispatch. cap_steps/llm_calls_used/cap_files are untouched here —
// budget is cumulative for the run's whole lifetime, not per-dispatch, so
// resuming can't be used to reset the spend cap.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!githubToken) return Response.json({ error: 'GitHub not connected.' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const answer = String(body.answer ?? '').trim()
  if (!answer) return Response.json({ error: 'Missing answer' }, { status: 400 })
  if (answer.length > MAX_ANSWER_LEN) return Response.json({ error: `Answer too long (max ${MAX_ANSWER_LEN} chars)` }, { status: 400 })

  const { data: run } = await supabase
    .from('cruise_goal_runs')
    .select('id, repo_id, user_id, status, branch_name, base_branch')
    .eq('id', id)
    .maybeSingle()
  if (!run || run.user_id !== uid) return Response.json({ error: 'Not found' }, { status: 404 })
  if (run.status !== 'awaiting_clarification') {
    return Response.json({ error: `Run is ${run.status}; not awaiting clarification.` }, { status: 409 })
  }

  const { data: repoRow } = await supabase.from('cruise_repos').select('full_name').eq('id', run.repo_id).maybeSingle()
  if (!repoRow?.full_name) return Response.json({ error: 'Repo not found' }, { status: 500 })
  const [owner, name] = repoRow.full_name.split('/')

  const token = randomBytes(24).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { error: updateErr } = await supabase
    .from('cruise_goal_runs')
    .update({
      status: 'queued',
      clarify_answer: answer,
      token_hash: tokenHash,
      github_token: githubToken,
      dispatched_at: new Date().toISOString(),
      finished_at: null,
    })
    .eq('id', id)
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 })

  const callbackBase = process.env.NEXTAUTH_URL
  if (!callbackBase || callbackBase.includes('localhost')) {
    return Response.json({ error: 'Goal runs require a public callback URL (NEXTAUTH_URL).' }, { status: 400 })
  }

  const { data: run2 } = await supabase.from('cruise_goal_runs').select('cap_files, cap_steps').eq('id', id).maybeSingle()
  const { ok, error: dispatchErr } = await dispatchGoalRun(githubToken, owner, name, run.base_branch, {
    goal_run_id: id,
    callback: callbackBase,
    token,
    branch: run.branch_name,
    cap_files: String(run2?.cap_files ?? 10),
    cap_steps: String(run2?.cap_steps ?? 40),
  })
  if (!ok) {
    await supabase.from('cruise_goal_runs').update({ status: 'failed', error: dispatchErr, finished_at: new Date().toISOString() }).eq('id', id)
    return Response.json({ error: dispatchErr }, { status: 502 })
  }

  return Response.json({ ok: true, status: 'queued' })
}
