import { createHash } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { createPullRequest } from '@/lib/github'

export const maxDuration = 30

// The callback a goal run's runner posts progress to. Token-authed like
// /api/cruise/ingest (the caller is a CI runner, not a browser). Phases:
//   start    -> status: planning
//   plan     -> stores the generated checklist, seeds cruise_goal_steps, status: running
//   step     -> updates one checklist item's status (the live progress view)
//   clarify  -> stops the run pending user input (this dispatch is done, not failed)
//   finalize -> completed/capped/failed/cancelled; opens the PR here (once,
//               server-side, using the run-scoped github_token) if any file
//               landed and no PR exists yet, then clears github_token.

const MAX_DESC = 2000
const MAX_STEPS = 200

function clampStr(v: unknown, max: number): string {
  return String(v ?? '').slice(0, max)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!raw) return Response.json({ error: 'Missing token' }, { status: 401 })
  const tokenHash = createHash('sha256').update(raw).digest('hex')

  const body = await req.json().catch(() => null)
  if (!body) return Response.json({ error: 'Bad request' }, { status: 400 })
  const phase = String(body.phase ?? '')

  const { data: run } = await supabase
    .from('cruise_goal_runs')
    .select('id, repo_id, token_hash, github_token, branch_name, base_branch, pr_number')
    .eq('id', id)
    .maybeSingle()
  // Constant-ish: same 401 whether the run is missing or the token is wrong.
  if (!run || run.token_hash !== tokenHash) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = { heartbeat_at: nowIso }

  if (phase === 'start') {
    patch.status = 'planning'
    await supabase.from('cruise_goal_runs').update(patch).eq('id', id)
    return Response.json({ ok: true })
  }

  if (phase === 'plan') {
    const steps: unknown[] = Array.isArray(body.steps) ? body.steps.slice(0, MAX_STEPS) : []
    patch.status = 'running'
    patch.plan = steps.map((s) => clampStr(s, MAX_DESC))
    await supabase.from('cruise_goal_runs').update(patch).eq('id', id)
    if (steps.length > 0) {
      const rows = steps.map((s, i) => ({ goal_run_id: id, seq: i, description: clampStr(s, MAX_DESC), status: 'pending' as const }))
      await supabase.from('cruise_goal_steps').upsert(rows, { onConflict: 'goal_run_id,seq' })
    }
    return Response.json({ ok: true })
  }

  if (phase === 'step') {
    const seq = Number(body.seq)
    const status = ['pending', 'running', 'done', 'failed'].includes(body.status) ? body.status : 'pending'
    if (!Number.isFinite(seq)) return Response.json({ error: 'Bad request: seq' }, { status: 400 })
    await supabase
      .from('cruise_goal_steps')
      .update({ status, detail: body.detail ? clampStr(body.detail, MAX_DESC) : null, updated_at: nowIso })
      .eq('goal_run_id', id).eq('seq', seq)
    await supabase.from('cruise_goal_runs').update(patch).eq('id', id)
    return Response.json({ ok: true })
  }

  if (phase === 'clarify') {
    patch.status = 'awaiting_clarification'
    patch.clarify_question = clampStr(body.question, MAX_DESC) || 'The agent needs clarification to continue safely.'
    patch.finished_at = nowIso
    await supabase.from('cruise_goal_runs').update(patch).eq('id', id)
    return Response.json({ ok: true })
  }

  if (phase === 'finalize') {
    let status = ['completed', 'capped', 'no_changes', 'build_failed', 'failed', 'cancelled'].includes(body.status) ? body.status : 'failed'
    // The build gate ran in the runner. A failed build means the committed work
    // is not mergeable — downgrade a would-be clean run to build_failed and open
    // its PR as a draft, rather than a green 'completed'. no_changes/failed/
    // cancelled are left as-is (nothing to gate).
    const buildFailed = body.build_ok === false && (status === 'completed' || status === 'capped')
    if (buildFailed) status = 'build_failed'
    patch.status = status
    patch.finished_at = nowIso
    patch.github_token = null // clear the run-scoped bridge token regardless of outcome
    if (body.remaining_summary) patch.remaining_summary = clampStr(body.remaining_summary, 4000)
    if (buildFailed && body.build_error) patch.error = clampStr(`Build failed:\n${body.build_error}`, 2000)
    else if (body.error) patch.error = clampStr(body.error, 2000)

    // Open the PR exactly once, server-side, only if at least one file landed.
    // build_failed still opens a PR (as a draft) so the work isn't lost.
    if (['completed', 'capped', 'build_failed'].includes(status) && !run.pr_number && run.github_token) {
      const { count } = await supabase
        .from('cruise_goal_files')
        .select('id', { count: 'exact', head: true })
        .eq('goal_run_id', id)
      if ((count ?? 0) > 0) {
        const { data: repoRow } = await supabase.from('cruise_repos').select('full_name').eq('id', run.repo_id).maybeSingle()
        if (repoRow?.full_name) {
          const [owner, name] = repoRow.full_name.split('/')
          const title = `Enry Cruise: ${clampStr(body.goal_title ?? 'autonomous goal run', 200)}`
          const prBody = [
            body.pr_summary ? clampStr(body.pr_summary, 4000) : 'Opened by Enry Cruise goal mode.',
            status === 'capped' && body.remaining_summary ? `\n**Capped before completion.** Remaining:\n${clampStr(body.remaining_summary, 4000)}` : '',
            buildFailed ? `\n⚠️ **Build is failing** — opened as a draft. Not mergeable as-is:\n\`\`\`\n${clampStr(body.build_error ?? '', 3000)}\n\`\`\`` : '',
          ].join('\n')
          const { pr, error: prError } = await createPullRequest(run.github_token, owner, name, title, prBody, run.branch_name, run.base_branch, buildFailed)
          if (pr) {
            patch.pr_number = pr.number
            patch.pr_url = pr.html_url
          } else if (prError) {
            patch.error = clampStr(`PR creation failed: ${prError}`, 2000)
          }
        }
      }
    }

    const { error: finalizeErr } = await supabase.from('cruise_goal_runs').update(patch).eq('id', id)
    // If a newer status ('no_changes', 'build_failed') is rejected because its
    // migration (010 / 011) isn't applied yet, fall back to a terminal status
    // the CHECK already allows, so the run never strands in 'running'. The draft
    // PR + error are already written, so the signal isn't lost — only the label.
    if (finalizeErr && (status === 'no_changes' || status === 'build_failed')) {
      patch.status = status === 'build_failed' ? 'completed' : 'failed'
      await supabase.from('cruise_goal_runs').update(patch).eq('id', id)
    }
    return Response.json({ ok: true, pr_url: patch.pr_url ?? null })
  }

  await supabase.from('cruise_goal_runs').update(patch).eq('id', id)
  return Response.json({ ok: true })
}
