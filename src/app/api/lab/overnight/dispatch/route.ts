import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getOvernightIdeas, insertOvernightRun, updateOvernightIdea, updateOvernightRun, reclaimStaleOvernightRuns } from '@/lib/lab/db'
import { createHash, randomUUID } from 'node:crypto'
import { checkWriteScope } from '@/lib/github'
import { ensureScratchRepo } from '@/lib/lab/overnight-provision'
import { OVERNIGHT_WORKFLOW_FILE } from '@/lib/lab/overnight-assets'

// Provisioning can create a repo and push a commit before the dispatch itself,
// so this needs more headroom than the old dispatch-only 20s.
export const maxDuration = 60

const BASE = 'https://api.github.com'
// A scratch repo's owner is incidental to the experiment, so there is no
// default org here: unset means "the connected GitHub account". The previous
// default pointed at an org that had never been created, which is what every
// dispatch 404'd on.
const SCRATCH_OWNER_OVERRIDE = process.env.ENRY_LAB_SCRATCH_ORG?.trim() || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function ghDispatch(token: string, owner: string, repo: string, ref: string, inputs: Record<string, string>) {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}/actions/workflows/${OVERNIGHT_WORKFLOW_FILE}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref, inputs }),
  })
  return { ok: res.status === 204, status: res.status }
}

// POST — dispatch the next queued idea to a scratch repo
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!githubToken) return Response.json({ error: 'GitHub not connected. Sign in with GitHub first.' }, { status: 400 })

  // Reclaim any run stuck without a heartbeat before touching the queue —
  // otherwise a dead run's idea stays wedged in 'running' forever with no
  // periodic job to notice (see reclaimStaleOvernightRuns's own comment).
  await reclaimStaleOvernightRuns()

  const body = await req.json().catch(() => ({}))
  const ideaId = String(body.idea_id ?? '').trim()

  let idea
  if (ideaId) {
    // Dispatch a specific idea
    const ideas = await getOvernightIdeas(uid, { status: 'queued' })
    idea = ideas.find((i) => i.id === ideaId)
    if (!idea) return Response.json({ error: 'Idea not found or not queued' }, { status: 404 })
  } else {
    // Pick the next queued idea
    const ideas = await getOvernightIdeas(uid, { status: 'queued' })
    if (ideas.length === 0) return Response.json({ error: 'No queued ideas' }, { status: 404 })
    idea = ideas[0]
  }

  // Committing .github/workflows/* needs the 'workflow' scope. Check before
  // creating anything, so a token that can't finish the job doesn't leave a
  // half-provisioned repo and a failed run record behind.
  const { scopes, error: scopeError } = await checkWriteScope(githubToken)
  if (scopeError) return Response.json({ error: `Could not verify GitHub permissions: ${scopeError}` }, { status: 502 })
  if (!scopes.includes('repo') || !scopes.includes('workflow')) {
    return Response.json(
      { error: 'missing_scope', message: "Overnight R&D needs the GitHub 'repo' and 'workflow' permissions to create a scratch repo and install its runner. Sign out and back in with GitHub to re-authorize." },
      { status: 403 },
    )
  }

  // Create the scratch repo and install the runner if they aren't there yet.
  // This is the step that never existed: the idea record only stores a repo
  // name, so without it the dispatch below targets a repo that was never made.
  const provisioned = await ensureScratchRepo(
    githubToken,
    SCRATCH_OWNER_OVERRIDE || idea.scratch_repo_owner,
    idea.scratch_repo_name,
    `Golem overnight experiment: ${idea.title}`,
  )
  if (!provisioned.ok || !provisioned.owner || !provisioned.defaultBranch) {
    return Response.json(
      { error: provisioned.error ?? 'Could not provision the scratch repo', kind: provisioned.errorKind },
      { status: 502 },
    )
  }

  // Generate a per-run dispatch token so the runner can call back
  const dispatchToken = `enry_overnight_${randomUUID()}`
  const tokenHash = createHash('sha256').update(dispatchToken).digest('hex')

  // Record where the repo actually landed, which may not be where the idea
  // asked for it — provisioning falls back to the connected account when the
  // requested owner isn't one this token can create under.
  const repoFull = `${provisioned.owner}/${idea.scratch_repo_name}`
  const run = await insertOvernightRun(uid, {
    idea_id: idea.id,
    scratch_repo_full: repoFull,
    dispatch_token_hash: tokenHash,
  })

  if (!run) return Response.json({ error: 'Failed to create run' }, { status: 500 })

  // Dispatch on the repo's real default branch — 'main' was hardcoded, which
  // is a second 404 for any repo whose default branch is named otherwise.
  const { ok, status } = await ghDispatch(githubToken, provisioned.owner, idea.scratch_repo_name, provisioned.defaultBranch, {
    run_id: run.id,
    idea_id: idea.id,
    idea_title: idea.title,
    idea_description: idea.description,
    callback: APP_URL,
    token: dispatchToken,
  })

  if (!ok) {
    await updateOvernightRun(run.id, {
      status: 'failed',
      error: `GitHub dispatch failed (HTTP ${status}) for ${repoFull} on ${provisioned.defaultBranch}. The repo and runner were provisioned, so this is the dispatch call itself.`,
      finished_at: new Date().toISOString(),
    })
    return Response.json({ error: `GitHub dispatch failed with status ${status}` }, { status: 502 })
  }

  // Mark idea as running
  await updateOvernightIdea(idea.id, uid, { status: 'running', latest_run_id: run.id })

  return Response.json({
    run: { id: run.id, idea_id: idea.id, status: 'dispatched', scratch_repo_full: repoFull },
    provisioned: { repo_created: provisioned.repoCreated, runner_committed: provisioned.filesCommitted, branch: provisioned.defaultBranch },
  })
}
