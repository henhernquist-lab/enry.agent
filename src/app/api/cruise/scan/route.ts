import { randomBytes, createHash } from 'node:crypto'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getDefaultBranch, dispatchScan } from '@/lib/cruise/github-actions'
import type { CruiseRepo } from '@/lib/cruise/types'

export const maxDuration = 30

// Triggers an on-demand scan: enforces the allowlist server-side, mints a
// per-scan callback token (only its hash is stored), records the scan, then
// dispatches the GitHub Actions workflow in the target repo.
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!githubToken) return Response.json({ error: 'GitHub not connected.' }, { status: 400 })

  const callbackBase = process.env.NEXTAUTH_URL
  if (!callbackBase || callbackBase.includes('localhost')) {
    return Response.json({ error: 'Scans require a public callback URL (NEXTAUTH_URL). The GitHub runner cannot reach localhost.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const repoName = String(body.repo ?? '').trim()
  if (!repoName) return Response.json({ error: 'Missing repo' }, { status: 400 })

  // Allowlist gate — the hard server-side enforcement point.
  const { data: repoRow, error: repoErr } = await supabase
    .from('cruise_repos')
    .select('*')
    .eq('user_id', uid)
    .eq('full_name', repoName)
    .maybeSingle()
  if (repoErr) return Response.json({ error: repoErr.message }, { status: 500 })
  const repo = repoRow as CruiseRepo | null
  if (!repo || !repo.enabled) return Response.json({ error: 'Cruise is not enabled for this repo.' }, { status: 403 })
  if (!repo.trigger_on_demand) return Response.json({ error: 'On-demand scans are disabled for this repo.' }, { status: 403 })

  const token = randomBytes(24).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  // Insert first so the runner's callback always finds a scan row. The partial
  // unique index (one live scan per repo) rejects a second concurrent scan.
  const { data: scan, error: insertErr } = await supabase
    .from('cruise_scans')
    .insert({
      repo_id: repo.id,
      user_id: uid,
      trigger: 'on_demand',
      fix_mode: repo.fix_mode,
      layers: repo.layers,
      status: 'queued',
      token_hash: tokenHash,
    })
    .select('id')
    .single()
  if (insertErr) {
    if (insertErr.code === '23505') {
      return Response.json({ error: 'A scan is already in progress for this repo.' }, { status: 409 })
    }
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  const [owner, name] = repoName.split('/')
  const { branch, error: branchErr } = await getDefaultBranch(githubToken, owner, name)
  if (branchErr || !branch) {
    await supabase.from('cruise_scans').update({ status: 'failed', error: `default branch: ${branchErr ?? 'unknown'}`, finished_at: new Date().toISOString() }).eq('id', scan.id)
    return Response.json({ error: `Could not resolve default branch: ${branchErr ?? 'unknown'}` }, { status: 502 })
  }

  const { ok, error: dispatchErr } = await dispatchScan(githubToken, owner, name, branch, {
    scan_id: scan.id,
    callback: callbackBase,
    token,
    layers: JSON.stringify(repo.layers),
    fix_mode: repo.fix_mode,
  })
  if (!ok) {
    await supabase.from('cruise_scans').update({ status: 'failed', error: dispatchErr, finished_at: new Date().toISOString() }).eq('id', scan.id)
    return Response.json({ error: dispatchErr }, { status: 502 })
  }

  return Response.json({ scan_id: scan.id, status: 'queued' })
}
