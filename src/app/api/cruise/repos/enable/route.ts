import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { checkWriteScope, commitFiles } from '@/lib/github'
import { getDefaultBranch, readRepoFile } from '@/lib/cruise/github-actions'
import { runnerFiles, isManaged, RUNNER_VERSION, WORKFLOW_PATH } from '@/lib/cruise/runner-assets'

export const maxDuration = 30

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

// Enables Cruise for a repo: verifies the required OAuth scope, guards against a
// name collision with a user's own workflow, commits the managed runner files
// to the repo's default branch (Phase 1: a workflow file + the static analyzer),
// and records the repo in the allowlist.
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!githubToken) return Response.json({ error: 'GitHub not connected. Sign in with GitHub first.' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const repo = String(body.repo ?? '').trim()
  if (!REPO_RE.test(repo)) return Response.json({ error: 'Invalid repo. Use owner/name.' }, { status: 400 })
  const [owner, name] = repo.split('/')

  // Scope gate — committing to .github/workflows/* needs the 'workflow' scope,
  // which older tokens won't have. Signal the UI to prompt a re-auth.
  const { scopes, error: scopeError } = await checkWriteScope(githubToken)
  if (scopeError) return Response.json({ error: `Could not verify GitHub permissions: ${scopeError}` }, { status: 502 })
  if (!scopes.includes('repo') || !scopes.includes('workflow')) {
    return Response.json(
      { error: 'missing_scope', message: "Enabling Cruise needs the GitHub 'workflow' permission. Sign out and back in with GitHub to re-authorize." },
      { status: 403 },
    )
  }

  const { branch: defaultBranch, error: branchError } = await getDefaultBranch(githubToken, owner, name)
  if (branchError || !defaultBranch) return Response.json({ error: `Could not resolve default branch: ${branchError ?? 'unknown'}` }, { status: 502 })

  // Collision / drift check on the one filename we own.
  const { content: existing, error: readError } = await readRepoFile(githubToken, owner, name, WORKFLOW_PATH)
  if (readError) return Response.json({ error: `Could not read existing workflow: ${readError}` }, { status: 502 })

  let workflowSha: string | null = null
  if (existing !== null && !isManaged(existing)) {
    return Response.json(
      { error: 'workflow_conflict', message: `${WORKFLOW_PATH} already exists in ${repo} and isn't managed by Enry Cruise. Rename or remove it, then enable again.` },
      { status: 409 },
    )
  }
  if (existing === null) {
    // Fresh install — commit all runner files in one atomic commit.
    const { commitSha, error: commitError } = await commitFiles(
      githubToken, owner, name, defaultBranch,
      'chore: enable Enry Cruise\n\nAdds the Cruise scan workflow + static analyzer. Managed by enry.agent.',
      runnerFiles().map((f) => ({ ...f, isNew: true })),
    )
    if (commitError || !commitSha) return Response.json({ error: `Could not commit runner files: ${commitError ?? 'unknown'}` }, { status: 502 })
    workflowSha = commitSha
  }

  const nowIso = new Date().toISOString()
  const { data, error: upsertError } = await supabase
    .from('cruise_repos')
    .upsert(
      {
        user_id: uid,
        full_name: repo,
        enabled: true,
        fix_mode: 'report_only',
        layers: ['static'],
        trigger_on_demand: true,
        ...(workflowSha ? { workflow_sha: workflowSha } : {}),
        runner_version: RUNNER_VERSION,
        updated_at: nowIso,
      },
      { onConflict: 'user_id,full_name' },
    )
    .select()
    .single()
  if (upsertError) return Response.json({ error: `Enabled on GitHub but failed to record: ${upsertError.message}` }, { status: 500 })

  return Response.json({ repo: data, committed: existing === null, default_branch: defaultBranch })
}
