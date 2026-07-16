import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getOvernightIdeas, insertOvernightRun, updateOvernightIdea, updateOvernightRun } from '@/lib/lab/db'
import { createHash, randomUUID } from 'node:crypto'

export const maxDuration = 20

const BASE = 'https://api.github.com'
const SCRATCH_ORG = process.env.ENRY_LAB_SCRATCH_ORG || 'enry-lab-experiments'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function ghDispatch(token: string, owner: string, repo: string, ref: string, inputs: Record<string, string>) {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}/actions/workflows/enry-overnight.yml/dispatches`, {
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

  // Generate a per-run dispatch token so the runner can call back
  const dispatchToken = `enry_overnight_${randomUUID()}`
  const tokenHash = createHash('sha256').update(dispatchToken).digest('hex')

  // Create the run record
  const repoFull = `${SCRATCH_ORG}/${idea.scratch_repo_name}`
  const run = await insertOvernightRun(uid, {
    idea_id: idea.id,
    scratch_repo_full: repoFull,
    dispatch_token_hash: tokenHash,
  })

  if (!run) return Response.json({ error: 'Failed to create run' }, { status: 500 })

  // Dispatch to GitHub Actions
  const { ok, status } = await ghDispatch(githubToken, SCRATCH_ORG, idea.scratch_repo_name, 'main', {
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
      error: `GitHub dispatch failed (HTTP ${status}). Verify the repo ${repoFull} has the enry-overnight.yml workflow on its main branch.`,
      finished_at: new Date().toISOString(),
    })
    return Response.json({ error: `GitHub dispatch failed with status ${status}` }, { status: 502 })
  }

  // Mark idea as running
  await updateOvernightIdea(idea.id, uid, { status: 'running', latest_run_id: run.id })

  return Response.json({
    run: { id: run.id, idea_id: idea.id, status: 'dispatched', scratch_repo_full: repoFull },
  })
}
