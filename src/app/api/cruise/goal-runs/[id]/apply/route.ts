import { createHash } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { createOrSwitchBranch, commitFiles, type CommitFileChange } from '@/lib/github'

export const maxDuration = 30

const MAX_FILES_PER_CALL = 25
const MAX_CONTENT_LEN = 200_000

// The single chokepoint where a goal run actually writes to GitHub. Every
// proposed edit from the LLM-driven runner passes through here — this route,
// not the runner, is what enforces cap_files authoritatively (an autonomous
// loop should never be trusted to police its own limit). Token-authed like
// the ingest route; uses the run-scoped github_token bridge (see
// 009_cruise_goals.sql) to call the same commitFiles/createOrSwitchBranch
// helpers the interactive Drive write flow already relies on.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!raw) return Response.json({ error: 'Missing token' }, { status: 401 })
  const tokenHash = createHash('sha256').update(raw).digest('hex')

  const body = await req.json().catch(() => null)
  const files = Array.isArray(body?.files) ? body.files.slice(0, MAX_FILES_PER_CALL) : []
  const message = typeof body?.message === 'string' ? body.message.slice(0, 500) : 'Enry Cruise: goal-run edit'
  if (files.length === 0) return Response.json({ error: 'Bad request: no files' }, { status: 400 })
  for (const f of files) {
    if (typeof f?.path !== 'string' || typeof f?.content !== 'string' || f.content.length > MAX_CONTENT_LEN) {
      return Response.json({ error: 'Bad request: malformed file entry' }, { status: 400 })
    }
  }

  const { data: run } = await supabase
    .from('cruise_goal_runs')
    .select('id, repo_id, token_hash, github_token, branch_name, base_branch, cap_files, status')
    .eq('id', id)
    .maybeSingle()
  if (!run || run.token_hash !== tokenHash) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['planning', 'running'].includes(run.status)) {
    return Response.json({ error: `Run is ${run.status}; not accepting writes.` }, { status: 409 })
  }
  if (!run.github_token) return Response.json({ error: 'No GitHub credential on this run.' }, { status: 500 })

  const { data: existingFiles } = await supabase.from('cruise_goal_files').select('path').eq('goal_run_id', id)
  const existingPaths = new Set((existingFiles ?? []).map((f) => f.path as string))
  const newPaths = files.map((f: { path: string }) => f.path).filter((p: string) => !existingPaths.has(p))
  if (existingPaths.size + newPaths.length > run.cap_files) {
    return Response.json({
      error: 'file_cap_exceeded',
      cap_files: run.cap_files,
      current_count: existingPaths.size,
      would_add: newPaths.length,
    }, { status: 200 })
  }

  const { data: repoRow } = await supabase.from('cruise_repos').select('full_name').eq('id', run.repo_id).maybeSingle()
  if (!repoRow?.full_name) return Response.json({ error: 'Repo not found' }, { status: 500 })
  const [owner, name] = repoRow.full_name.split('/')

  const { error: branchErr } = await createOrSwitchBranch(run.github_token, owner, name, run.branch_name, run.base_branch)
  if (branchErr) return Response.json({ error: `Could not prepare branch: ${branchErr}` }, { status: 502 })

  const changes: CommitFileChange[] = files.map((f: { path: string; content: string; is_new?: boolean }) => ({
    path: f.path,
    content: f.content,
    isNew: f.is_new ?? !existingPaths.has(f.path),
  }))
  const { commitSha, error: commitErr } = await commitFiles(run.github_token, owner, name, run.branch_name, message, changes)
  if (!commitSha) return Response.json({ error: `Commit failed: ${commitErr}` }, { status: 502 })

  if (newPaths.length > 0) {
    await supabase
      .from('cruise_goal_files')
      .upsert(newPaths.map((p: string) => ({ goal_run_id: id, path: p, commit_sha: commitSha })), { onConflict: 'goal_run_id,path', ignoreDuplicates: true })
  }
  await supabase.from('cruise_goal_runs').update({ heartbeat_at: new Date().toISOString() }).eq('id', id)

  return Response.json({ ok: true, commit_sha: commitSha, files_changed: existingPaths.size + newPaths.length, cap_files: run.cap_files })
}
