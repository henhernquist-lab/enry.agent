const BASE = 'https://api.github.com'

// Every call in this file is a small JSON API request (metadata reads, blob/
// tree/commit/ref writes) — none of them legitimately need more than this to
// complete. Without a ceiling, a slow/degraded GitHub response burns time
// invisibly before any of the AI SDK timeouts downstream even start their
// clock, silently eating the margin those numbers assume they have.
const GH_FETCH_TIMEOUT_MS = 10_000

async function ghFetch(token: string, path: string, options: RequestInit = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GH_FETCH_TIMEOUT_MS)
  try {
    return await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...((options.headers ?? {}) as Record<string, string>),
      },
    })
  } catch (e) {
    // Attribute the failure to our own timeout when it was the cause, rather
    // than letting a raw DOMException/AbortError string bubble up to the
    // caller's catch block unexplained.
    if (controller.signal.aborted) {
      throw new Error(`GitHub API request timed out after ${GH_FETCH_TIMEOUT_MS / 1000}s: ${path}`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export interface Repo {
  id: number
  name: string
  full_name: string
  private: boolean
  description: string | null
  html_url: string
  updated_at: string
  language: string | null
  stargazers_count: number
  default_branch: string
}

export interface Issue {
  number: number
  title: string
  body: string | null
  state: string
  html_url: string
  created_at: string
  user: { login: string }
  labels: { name: string }[]
}

export async function listRepos(
  accessToken: string,
): Promise<{ repos: Repo[]; error: string | null }> {
  try {
    const res = await ghFetch(accessToken, '/user/repos?sort=updated&per_page=50&affiliation=owner')
    if (!res.ok) return { repos: [], error: `GitHub API error ${res.status}` }
    const data = await res.json()
    return { repos: data as Repo[], error: null }
  } catch (e) {
    return { repos: [], error: String(e) }
  }
}

export async function listIssues(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<{ issues: Issue[]; error: string | null }> {
  try {
    const res = await ghFetch(accessToken, `/repos/${owner}/${repo}/issues?state=open&per_page=30`)
    if (!res.ok) return { issues: [], error: `GitHub API error ${res.status}` }
    const data = await res.json() as Array<Issue & { pull_request?: unknown }>
    // /issues returns both issues and PRs; filter to issues only
    return { issues: data.filter(i => !i.pull_request), error: null }
  } catch (e) {
    return { issues: [], error: String(e) }
  }
}

export async function createIssue(
  accessToken: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
): Promise<{ issue: Issue | null; error: string | null }> {
  try {
    const res = await ghFetch(accessToken, `/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    })
    if (!res.ok) {
      const err = await res.text()
      return { issue: null, error: `GitHub API error ${res.status}: ${err}` }
    }
    const data = await res.json()
    return { issue: data as Issue, error: null }
  } catch (e) {
    return { issue: null, error: String(e) }
  }
}

export interface TreeEntry {
  path: string
  type: string
  size: number
}

export async function getRepoTree(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<{ tree: TreeEntry[]; error: string | null }> {
  try {
    const res = await ghFetch(accessToken, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
    if (!res.ok) return { tree: [], error: `GitHub API error ${res.status}` }
    const data = await res.json()
    const tree = ((data.tree ?? []) as { path: string; type: string; size?: number }[])
      .filter((f) => f.type === 'blob')
      .map((f) => ({ path: f.path, type: f.type, size: f.size ?? 0 }))
    return { tree, error: null }
  } catch (e) {
    return { tree: [], error: String(e) }
  }
}

export async function getFileContent(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
): Promise<{ content: string | null; sha: string | null; error: string | null }> {
  try {
    const res = await ghFetch(accessToken, `/repos/${owner}/${repo}/contents/${path}`)
    if (!res.ok) return { content: null, sha: null, error: `GitHub API error ${res.status}` }
    const data = await res.json()
    // Array means it's a directory
    if (Array.isArray(data)) {
      const entries = (data as { name: string; type: string; size: number }[])
        .map((e) => `${e.type === 'dir' ? '📁' : '📄'} ${e.name}`)
        .join('\n')
      return { content: `Directory listing:\n${entries}`, sha: null, error: null }
    }
    if (data.encoding === 'base64') {
      const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
      return { content: decoded, sha: data.sha ?? null, error: null }
    }
    return { content: data.content ?? null, sha: data.sha ?? null, error: null }
  } catch (e) {
    return { content: null, sha: null, error: String(e) }
  }
}

// ── Write API (Live Terminal coding-agent mode) ──────────────────────────────
// Every write call goes through here, never through chat. `repo` OAuth scope
// required for all of it — checkWriteScope() is called before the first
// write action in a session so a scope problem surfaces as a clear terminal
// message instead of a cryptic 403 three calls deep.

export async function checkWriteScope(accessToken: string): Promise<{ hasRepoScope: boolean; scopes: string[]; error: string | null }> {
  try {
    const res = await ghFetch(accessToken, '/user')
    if (!res.ok) return { hasRepoScope: false, scopes: [], error: `GitHub API error ${res.status}` }
    const scopeHeader = res.headers.get('x-oauth-scopes') ?? ''
    const scopes = scopeHeader.split(',').map((s) => s.trim()).filter(Boolean)
    return { hasRepoScope: scopes.includes('repo'), scopes, error: null }
  } catch (e) {
    return { hasRepoScope: false, scopes: [], error: String(e) }
  }
}

export async function branchExists(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<boolean> {
  // Unlike every other function in this file, this one had no try/catch at
  // all before the timeout above existed — a plain network failure would
  // already have thrown uncaught into createOrSwitchBranch, which also
  // doesn't wrap this call, all the way up through an unhandled route
  // rejection (no top-level try/catch in exec/route.ts's POST). A timeout is
  // now a deterministic, much more likely way to hit that same gap, so it's
  // closed here instead of left to surface as a raw 500. Failing to "doesn't
  // exist" on a timeout is safe, not silent: if the branch actually does
  // exist, the subsequent create POST 422s with a real, still-caught error
  // instead of silently corrupting anything.
  try {
    const res = await ghFetch(accessToken, `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`)
    return res.ok
  } catch (e) {
    console.error('[github] branchExists threw:', e)
    return false
  }
}

async function getRefSha(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<{ sha: string | null; error: string | null }> {
  // A ref created moments earlier (createOrSwitchBranch just POSTed it) can 404
  // for a beat — GitHub's Git Data API is eventually consistent, and the write
  // replica the create hit may not be the read replica this lands on. Retry a
  // few times on 404 before giving up so the first commit of a run doesn't fail
  // a coin-flip. A genuinely missing ref just 404s after the retries.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await ghFetch(accessToken, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`)
      if (res.ok) {
        const data = await res.json()
        return { sha: data.object?.sha ?? null, error: null }
      }
      if (res.status === 404 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)))
        continue
      }
      return { sha: null, error: `GitHub API error ${res.status}` }
    } catch (e) {
      return { sha: null, error: String(e) }
    }
  }
}

// Creates `name` off `fromBranch` if it doesn't exist yet, or just confirms
// it does. Never touches main directly — fromBranch is the repo's default
// branch by convention, name is always the new working branch.
export async function createOrSwitchBranch(
  accessToken: string,
  owner: string,
  repo: string,
  name: string,
  fromBranch: string,
): Promise<{ created: boolean; error: string | null }> {
  if (await branchExists(accessToken, owner, repo, name)) {
    return { created: false, error: null }
  }
  const { sha, error: shaError } = await getRefSha(accessToken, owner, repo, fromBranch)
  if (shaError || !sha) return { created: false, error: shaError ?? `Could not resolve ${fromBranch}` }

  try {
    const res = await ghFetch(accessToken, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${name}`, sha }),
    })
    if (!res.ok) {
      const err = await res.text()
      return { created: false, error: `GitHub API error ${res.status}: ${err}` }
    }
    return { created: true, error: null }
  } catch (e) {
    return { created: false, error: String(e) }
  }
}

export interface CommitFileChange {
  path: string
  content: string
  // true = file did not exist before this change (created); false = existing
  // file being modified. Informational only — the tree entry shape is the
  // same either way.
  isNew: boolean
  // true = remove the path from the tree (deletion). content is ignored.
  deleted?: boolean
}

// Bundles one or more file changes into a single real commit on `branch`,
// via the Git Data API (blob -> tree -> commit -> ref update) so multiple
// files land atomically in one commit instead of one commit per file. This
// is the only step in the whole write flow that actually mutates the repo —
// everything before it (propose/apply) only touches the working-copy table.
export async function commitFiles(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  message: string,
  changes: CommitFileChange[],
): Promise<{ commitSha: string | null; error: string | null }> {
  if (changes.length === 0) return { commitSha: null, error: 'No changes to commit' }

  try {
    const { sha: parentSha, error: parentError } = await getRefSha(accessToken, owner, repo, branch)
    if (parentError || !parentSha) return { commitSha: null, error: parentError ?? `Could not resolve branch ${branch}` }

    const parentCommitRes = await ghFetch(accessToken, `/repos/${owner}/${repo}/git/commits/${parentSha}`)
    if (!parentCommitRes.ok) return { commitSha: null, error: `GitHub API error ${parentCommitRes.status} reading parent commit` }
    const parentCommit = await parentCommitRes.json()
    const baseTreeSha = parentCommit.tree?.sha
    if (!baseTreeSha) return { commitSha: null, error: 'Could not resolve base tree' }

    // One blob per changed file; deletions carry no blob (tree entry sha:null).
    type TreeEntryPut = { path: string; mode: '100644'; type: 'blob'; sha: string | null }
    const treeEntries: TreeEntryPut[] = []
    for (const change of changes) {
      if (change.deleted) {
        treeEntries.push({ path: change.path, mode: '100644', type: 'blob', sha: null })
        continue
      }
      const blobRes = await ghFetch(accessToken, `/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: Buffer.from(change.content, 'utf-8').toString('base64'), encoding: 'base64' }),
      })
      if (!blobRes.ok) return { commitSha: null, error: `GitHub API error ${blobRes.status} creating blob for ${change.path}` }
      const blobData = await blobRes.json()
      treeEntries.push({ path: change.path, mode: '100644', type: 'blob', sha: blobData.sha })
    }

    const treeRes = await ghFetch(accessToken, `/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    })
    if (!treeRes.ok) return { commitSha: null, error: `GitHub API error ${treeRes.status} creating tree` }
    const treeData = await treeRes.json()

    const commitRes = await ghFetch(accessToken, `/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, tree: treeData.sha, parents: [parentSha] }),
    })
    if (!commitRes.ok) return { commitSha: null, error: `GitHub API error ${commitRes.status} creating commit` }
    const commitData = await commitRes.json()

    // Fast-forward only — never force. If the branch moved since we read
    // parentSha (e.g. a concurrent push), this rejects instead of
    // overwriting whatever landed there.
    const refRes = await ghFetch(accessToken, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitData.sha, force: false }),
    })
    if (!refRes.ok) {
      const err = await refRes.text()
      return { commitSha: null, error: `Branch moved since this commit was prepared — could not fast-forward (GitHub ${refRes.status}): ${err}` }
    }

    return { commitSha: commitData.sha, error: null }
  } catch (e) {
    return { commitSha: null, error: String(e) }
  }
}

export interface PullRequest {
  number: number
  html_url: string
  title: string
}

export async function createPullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string,
  draft = false,
): Promise<{ pr: PullRequest | null; error: string | null }> {
  try {
    const res = await ghFetch(accessToken, `/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, head, base, draft }),
    })
    if (!res.ok) {
      const err = await res.text()
      return { pr: null, error: `GitHub API error ${res.status}: ${err}` }
    }
    const data = await res.json()
    return { pr: { number: data.number, html_url: data.html_url, title: data.title }, error: null }
  } catch (e) {
    return { pr: null, error: String(e) }
  }
}
