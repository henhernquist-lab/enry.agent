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
