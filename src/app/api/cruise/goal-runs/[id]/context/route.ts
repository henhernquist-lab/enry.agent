import { createHash } from 'node:crypto'
import { supabase } from '@/lib/supabase'

export const maxDuration = 30

// The runner's first call on every dispatch (fresh or resumed): fetches the
// goal, any prior plan/step log/Q&A, and current budget state. This is what
// makes stop-and-resume work — a clarifying-question dispatch ends, the user
// answers, a new dispatch starts, and this endpoint is how the new process
// picks up exactly where the last one left off instead of starting blind.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!raw) return Response.json({ error: 'Missing token' }, { status: 401 })
  const tokenHash = createHash('sha256').update(raw).digest('hex')

  const { data: run } = await supabase
    .from('cruise_goal_runs')
    .select('id, repo_id, token_hash, goal, mode, plan, clarify_question, clarify_answer, branch_name, base_branch, cap_files, cap_steps, llm_calls_used')
    .eq('id', id)
    .maybeSingle()
  if (!run || run.token_hash !== tokenHash) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: repoRow } = await supabase.from('cruise_repos').select('full_name, scanfix_categories').eq('id', run.repo_id).maybeSingle()

  const { data: steps } = await supabase
    .from('cruise_goal_steps')
    .select('seq, description, status, detail')
    .eq('goal_run_id', id)
    .order('seq', { ascending: true })

  const { data: files } = await supabase
    .from('cruise_goal_files')
    .select('path')
    .eq('goal_run_id', id)

  return Response.json({
    goal: run.goal,
    mode: run.mode ?? 'goal',
    scanfix_categories: repoRow?.scanfix_categories ?? null,
    repo: repoRow?.full_name ?? null,
    branch: run.branch_name,
    base_branch: run.base_branch,
    plan: run.plan ?? null,
    clarify_question: run.clarify_question,
    clarify_answer: run.clarify_answer,
    steps: steps ?? [],
    files_changed: (files ?? []).map((f) => f.path),
    cap_files: run.cap_files,
    cap_steps: run.cap_steps,
    llm_calls_used: run.llm_calls_used,
  })
}
