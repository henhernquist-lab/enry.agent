// GitHub Actions helpers for Cruise: reading a repo's copy of the workflow file
// (for conflict/drift detection) and dispatching a scan run. Uses the same
// authenticated-fetch shape as src/lib/github.ts.

const BASE = 'https://api.github.com'

async function ghFetch(token: string, path: string, options: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...((options.headers ?? {}) as Record<string, string>),
    },
  })
}

// Resolves a repo's default branch — the branch a workflow file must live on
// to be dispatchable, and the branch the enable flow commits to.
export async function getDefaultBranch(
  token: string,
  owner: string,
  repo: string,
): Promise<{ branch: string | null; error: string | null }> {
  try {
    const res = await ghFetch(token, `/repos/${owner}/${repo}`)
    if (!res.ok) return { branch: null, error: `GitHub API error ${res.status}` }
    const data = (await res.json()) as { default_branch?: string }
    return { branch: data.default_branch ?? null, error: null }
  } catch (e) {
    return { branch: null, error: String(e) }
  }
}

// Reads a file's decoded content at a path, or null if it doesn't exist.
export async function readRepoFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
): Promise<{ content: string | null; error: string | null }> {
  try {
    const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}`)
    if (res.status === 404) return { content: null, error: null }
    if (!res.ok) return { content: null, error: `GitHub API error ${res.status}` }
    const data = (await res.json()) as { content?: string; encoding?: string }
    if (!data.content) return { content: null, error: null }
    return { content: Buffer.from(data.content, 'base64').toString('utf-8'), error: null }
  } catch (e) {
    return { content: null, error: String(e) }
  }
}

export interface DispatchInputs {
  scan_id: string
  callback: string
  token: string
  layers: string // JSON array string, e.g. '["static"]'
  fix_mode: string
}

// Fires the workflow_dispatch event for enry-cruise.yml on the given ref.
// GitHub returns 204 with no body on success and does NOT return the run id —
// the run id is learned later from the runner's callback (or a lookup), so this
// only reports whether the dispatch was accepted.
export async function dispatchScan(
  token: string,
  owner: string,
  repo: string,
  ref: string,
  inputs: DispatchInputs,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await ghFetch(
      token,
      `/repos/${owner}/${repo}/actions/workflows/enry-cruise.yml/dispatches`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, inputs }),
      },
    )
    if (res.status === 204) return { ok: true, error: null }
    const body = await res.text().catch(() => '')
    // 404 here usually means the workflow file isn't on the default branch yet
    // (or Actions is disabled for the repo) — surface that specifically.
    if (res.status === 404) {
      return { ok: false, error: 'Workflow not found on the default branch, or Actions is disabled for this repo. Re-enable Cruise for this repo.' }
    }
    return { ok: false, error: `GitHub dispatch failed: ${res.status} ${body}` }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export interface GoalDispatchInputs {
  goal_run_id: string
  callback: string
  token: string
  branch: string
  cap_files: string  // stringified number — workflow_dispatch inputs are all strings
  cap_steps: string
}

// Fires workflow_dispatch for enry-cruise-goal.yml. Unlike dispatchScan, the
// workflow filename isn't hardcoded — goal runs live in a separate file from
// the scan workflow (different permissions: goal runs stay contents:read too,
// since writes go through /api/cruise/goal-runs/[id]/apply, but keeping them
// as separate files keeps the two dispatch surfaces independently
// versionable).
export async function dispatchGoalRun(
  token: string,
  owner: string,
  repo: string,
  ref: string,
  inputs: GoalDispatchInputs,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await ghFetch(
      token,
      `/repos/${owner}/${repo}/actions/workflows/enry-cruise-goal.yml/dispatches`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, inputs }),
      },
    )
    if (res.status === 204) return { ok: true, error: null }
    const body = await res.text().catch(() => '')
    if (res.status === 404) {
      return { ok: false, error: 'Goal-run workflow not found on the default branch, or Actions is disabled for this repo. Re-enable Cruise for this repo.' }
    }
    return { ok: false, error: `GitHub dispatch failed: ${res.status} ${body}` }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
