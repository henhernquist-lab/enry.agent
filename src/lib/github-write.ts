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

// ─── Shared result types ──────────────────────────────────────

export interface WriteResult {
  ok: boolean
  error?: string
  // set on success
  url?: string      // PR URL, file HTML URL, or repo HTML URL
  branch?: string
  path?: string
}

// ─── GitHub API write operations ──────────────────────────────

/** Create a new branch from the repo's default branch (main/master). */
export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
): Promise<WriteResult> {
  try {
    // 1. Get the default branch's ref to copy from
    const repoRes = await ghFetch(token, `/repos/${owner}/${repo}`)
    if (!repoRes.ok) return { ok: false, error: `Could not fetch repo: ${repoRes.status}` }
    const repoData = await repoRes.json() as { default_branch: string }
    const defaultBranch = repoData.default_branch

    // 2. Get SHA of default branch
    const refRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`)
    if (!refRes.ok) return { ok: false, error: `Could not get ref for ${defaultBranch}: ${refRes.status}` }
    const refData = await refRes.json() as { object: { sha: string } }
    const sha = refData.object.sha

    // 3. Create new branch
    const createRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
    })
    if (!createRes.ok) {
      const err = await createRes.text().catch(() => '')
      // 422 means branch already exists — treat as success
      if (createRes.status === 422) {
        return { ok: true, branch: branchName }
      }
      return { ok: false, error: `Could not create branch: ${createRes.status} ${err}` }
    }

    return { ok: true, branch: branchName }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Create a new file on a branch. Fails if file already exists. */
export async function createFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
): Promise<WriteResult> {
  try {
    const encoded = Buffer.from(content, 'utf-8').toString('base64')
    const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: encoded, branch }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      return { ok: false, error: `Could not create file: ${res.status} ${err}` }
    }
    const data = await res.json() as { content: { html_url: string } }
    return { ok: true, url: data.content.html_url, path, branch }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Update an existing file on a branch. Requires the file's current SHA. */
export async function updateFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
): Promise<WriteResult> {
  try {
    // Get current SHA
    const getRes = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`)
    if (!getRes.ok) {
      const err = await getRes.text().catch(() => '')
      return { ok: false, error: `Could not read file for update: ${getRes.status} ${err}` }
    }
    const fileData = await getRes.json() as { sha: string }
    if (!fileData.sha) {
      return { ok: false, error: `File not found: ${path} (use create_file for new files)` }
    }

    const encoded = Buffer.from(content, 'utf-8').toString('base64')
    const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: encoded, branch, sha: fileData.sha }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      return { ok: false, error: `Could not update file: ${res.status} ${err}` }
    }
    const data = await res.json() as { content: { html_url: string } }
    return { ok: true, url: data.content.html_url, path, branch }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Create a pull request from head branch into base branch. */
export async function createPR(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string,
): Promise<WriteResult & { number?: number }> {
  try {
    const res = await ghFetch(token, `/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, head, base }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      return { ok: false, error: `Could not create PR: ${res.status} ${err}` }
    }
    const data = await res.json() as { number: number; html_url: string }
    return { ok: true, url: data.html_url, number: data.number, branch: head }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Create a new repository under the authenticated user. */
export async function createRepo(
  token: string,
  name: string,
  description: string,
  isPrivate: boolean,
): Promise<WriteResult> {
  try {
    const res = await ghFetch(token, '/user/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, private: isPrivate, auto_init: true }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      return { ok: false, error: `Could not create repo: ${res.status} ${err}` }
    }
    const data = await res.json() as { html_url: string }
    return { ok: true, url: data.html_url }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
