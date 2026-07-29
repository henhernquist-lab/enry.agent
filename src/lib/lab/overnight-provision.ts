import { commitFiles } from '@/lib/github'
import { getDefaultBranch, readRepoFile } from '@/lib/cruise/github-actions'
import {
  overnightRunnerFiles,
  overnightManagedVersion,
  isOvernightManaged,
  OVERNIGHT_WORKFLOW_PATH,
  OVERNIGHT_RUNNER_VERSION,
} from '@/lib/lab/overnight-assets'

// ───────────────────────────────────────────────────────────────────
// Scratch-repo provisioning for Overnight Autonomous R&D.
//
// Dispatch used to POST workflow_dispatch straight at
// <org>/<idea.scratch_repo_name> and surface GitHub's bare 404. Three things
// had to be true for that to work and none of them were ever made true: the
// owner had to exist, the repo had to exist, and the workflow had to be on its
// default branch. Nothing in the codebase created any of them — the idea record
// only ever stored a repo *name*, so every dispatch 404'd.
//
// So provisioning happens here, before dispatch, and the failures are named
// rather than collapsed into "404".
// ───────────────────────────────────────────────────────────────────

const BASE = 'https://api.github.com'

function gh(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
}

export type ProvisionErrorKind =
  | 'owner_missing'
  | 'owner_forbidden'
  | 'repo_create_failed'
  | 'workflow_conflict'
  | 'commit_failed'
  | 'branch_unresolved'

export interface ProvisionResult {
  ok: boolean
  /** Login the repo actually lives under — may differ from what was requested. */
  owner?: string
  repoCreated?: boolean
  filesCommitted?: boolean
  defaultBranch?: string
  errorKind?: ProvisionErrorKind
  error?: string
}

/** The login of the token's own account. */
export async function authenticatedLogin(token: string): Promise<string | null> {
  const res = await gh(token, '/user')
  if (!res.ok) return null
  const data = (await res.json()) as { login?: string }
  return data.login ?? null
}

type OwnerKind = 'user' | 'org' | 'missing' | 'other-user'

/**
 * Classify the owner so repo creation targets the right endpoint. Creating
 * under an org uses /orgs/{org}/repos; creating under yourself uses
 * /user/repos. A login that is neither is unusable — you cannot create a repo
 * in someone else's account.
 */
async function classifyOwner(token: string, owner: string, self: string | null): Promise<OwnerKind> {
  if (self && owner.toLowerCase() === self.toLowerCase()) return 'user'
  const res = await gh(token, `/orgs/${owner}`)
  if (res.ok) return 'org'
  if (res.status === 404) {
    // Could be a real user account rather than a nonexistent name — those are
    // distinguishable and the remedies differ, so don't lump them together.
    const asUser = await gh(token, `/users/${owner}`)
    return asUser.ok ? 'other-user' : 'missing'
  }
  return 'missing'
}

async function repoExists(token: string, owner: string, name: string): Promise<boolean> {
  const res = await gh(token, `/repos/${owner}/${name}`)
  return res.ok
}

/**
 * Make `<owner>/<name>` exist, private, with the overnight runner committed to
 * its default branch. Idempotent: safe to call before every dispatch, and it
 * re-commits when the repo carries an older runner version.
 *
 * `preferredOwner` is a request, not a guarantee — when it names something the
 * token can't create under, provisioning falls back to the authenticated user
 * rather than failing, since a scratch repo's owner is incidental to the
 * experiment. The resolved owner comes back in the result so the caller can
 * record where the repo actually landed.
 */
export async function ensureScratchRepo(
  token: string,
  preferredOwner: string,
  name: string,
  description: string,
): Promise<ProvisionResult> {
  const self = await authenticatedLogin(token)

  let owner = preferredOwner
  let kind = await classifyOwner(token, owner, self)

  if (kind === 'missing' || kind === 'other-user') {
    if (!self) {
      return {
        ok: false,
        errorKind: kind === 'missing' ? 'owner_missing' : 'owner_forbidden',
        error: `GitHub owner "${preferredOwner}" ${kind === 'missing' ? 'does not exist' : 'is another user\'s account'}, and the connected token's own account could not be resolved.`,
      }
    }
    owner = self
    kind = 'user'
  }

  let repoCreated = false
  if (!(await repoExists(token, owner, name))) {
    const path = kind === 'org' ? `/orgs/${owner}/repos` : '/user/repos'
    const res = await gh(token, path, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: description.slice(0, 350),
        private: true,
        // Without this the repo has no default branch, so there is nothing to
        // commit the workflow onto and nothing for workflow_dispatch to target.
        auto_init: true,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return {
        ok: false,
        owner,
        errorKind: res.status === 403 ? 'owner_forbidden' : 'repo_create_failed',
        error: `Could not create ${owner}/${name} (HTTP ${res.status}). ${detail.slice(0, 200)}`,
      }
    }
    repoCreated = true
  }

  const { branch, error: branchError } = await getDefaultBranch(token, owner, name)
  if (branchError || !branch) {
    return { ok: false, owner, repoCreated, errorKind: 'branch_unresolved', error: `Could not resolve the default branch of ${owner}/${name}: ${branchError ?? 'unknown'}` }
  }

  const { content: existing, error: readError } = await readRepoFile(token, owner, name, OVERNIGHT_WORKFLOW_PATH)
  if (readError) {
    return { ok: false, owner, repoCreated, defaultBranch: branch, errorKind: 'commit_failed', error: `Could not read ${OVERNIGHT_WORKFLOW_PATH}: ${readError}` }
  }
  // Never clobber a workflow of the same name that isn't ours.
  if (existing !== null && !isOvernightManaged(existing)) {
    return {
      ok: false,
      owner,
      repoCreated,
      defaultBranch: branch,
      errorKind: 'workflow_conflict',
      error: `${OVERNIGHT_WORKFLOW_PATH} already exists in ${owner}/${name} and isn't managed by Golem.`,
    }
  }

  let filesCommitted = false
  const onRepoVersion = existing === null ? 0 : overnightManagedVersion(existing)
  if (onRepoVersion < OVERNIGHT_RUNNER_VERSION) {
    const fresh = existing === null
    const { error: commitError } = await commitFiles(
      token, owner, name, branch,
      fresh
        ? 'chore: provision Golem overnight runner\n\nManaged by Golem (Enry Lab).'
        : `chore: update Golem overnight runner to v${OVERNIGHT_RUNNER_VERSION}\n\nManaged by Golem.`,
      overnightRunnerFiles().map((f) => ({ ...f, isNew: fresh })),
    )
    if (commitError) {
      return { ok: false, owner, repoCreated, defaultBranch: branch, errorKind: 'commit_failed', error: `Could not commit the overnight runner: ${commitError}` }
    }
    filesCommitted = true
  }

  return { ok: true, owner, repoCreated, filesCommitted, defaultBranch: branch }
}
