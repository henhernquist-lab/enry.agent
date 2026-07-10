import type { ParsedCommand } from './parse'
import type { ExecResult } from './exec'

// Live Terminal — git commands mapped to the GitHub REST API.
//
// Vercel's runtime has no `git` binary, so read-only git operations are served
// from the API and rendered in git's output format. Real data from the real
// repo; nothing is spawned. All calls are scoped by the caller's OAuth token.

const GH = 'https://api.github.com'

export interface GitContext {
  token: string
  owner: string
  repo: string
  headSha: string
  defaultBranch: string
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export async function runGit(parsed: ParsedCommand, ctx: GitContext): Promise<ExecResult> {
  switch (parsed.subcommand) {
    case 'log':
      return gitLog(parsed, ctx)
    case 'status':
      return gitStatus(ctx)
    case 'diff':
      return gitDiff(parsed, ctx)
    case 'show':
      return gitShow(parsed, ctx)
    case 'branch':
      return gitBranch(parsed, ctx)
    default:
      return { output: `git ${parsed.subcommand}: not supported`, exitCode: 1 }
  }
}

function intFlag(parsed: ParsedCommand, ...names: string[]): number | null {
  for (const name of names) {
    const idx = parsed.flags.indexOf(name)
    if (idx !== -1 && parsed.flags[idx + 1] !== undefined) {
      const n = parseInt(parsed.flags[idx + 1], 10)
      if (!Number.isNaN(n)) return n
    }
    const combined = parsed.flags.find((f) => f.startsWith(name + '='))
    if (combined) {
      const n = parseInt(combined.split('=')[1], 10)
      if (!Number.isNaN(n)) return n
    }
  }
  return null
}

async function gitLog(parsed: ParsedCommand, ctx: GitContext): Promise<ExecResult> {
  const count = Math.min(intFlag(parsed, '-n', '--max-count') ?? 20, 100)
  const oneline = parsed.flags.includes('--oneline')
  // A positional that isn't after "--" is treated as a starting ref; "-- path"
  // is a path filter.
  const ref = parsed.positionals[0] && !parsed.positionals[0].includes('/') ? parsed.positionals[0] : ctx.defaultBranch
  const pathFilter = parsed.positionals.find((p) => p.includes('/') || p.includes('.'))

  const params = new URLSearchParams({ sha: ref, per_page: String(count) })
  if (pathFilter) params.set('path', pathFilter)

  const res = await fetch(`${GH}/repos/${ctx.owner}/${ctx.repo}/commits?${params}`, { headers: headers(ctx.token) })
  if (!res.ok) return { output: `fatal: could not read log (GitHub ${res.status})`, exitCode: 128 }
  const commits = (await res.json()) as GhCommit[]

  if (commits.length === 0) return { output: '(no commits)', exitCode: 0 }

  const lines: string[] = []
  for (const c of commits) {
    const sha = c.sha.slice(0, 7)
    const msg = c.commit.message.split('\n')[0]
    if (oneline) {
      lines.push(`${sha} ${msg}`)
    } else {
      lines.push(`commit ${c.sha}`)
      lines.push(`Author: ${c.commit.author?.name ?? '?'} <${c.commit.author?.email ?? ''}>`)
      lines.push(`Date:   ${c.commit.author?.date ?? ''}`)
      lines.push('')
      lines.push(`    ${msg}`)
      lines.push('')
    }
  }
  return { output: lines.join('\n'), exitCode: 0 }
}

async function gitStatus(ctx: GitContext): Promise<ExecResult> {
  const lines = [
    `On branch ${ctx.defaultBranch}`,
    `HEAD detached at ${ctx.headSha.slice(0, 7)}`,
    '',
    'nothing to commit, working tree clean',
    '',
    '(read-only snapshot — this terminal cannot modify the repo)',
  ]
  return { output: lines.join('\n'), exitCode: 0 }
}

async function gitDiff(parsed: ParsedCommand, ctx: GitContext): Promise<ExecResult> {
  const nameOnly = parsed.flags.includes('--name-only')
  const statOnly = parsed.flags.includes('--stat')

  // Determine the two endpoints to compare.
  let base: string | null = null
  let headRef: string = ctx.headSha
  const joined = parsed.positionals.filter((p) => !p.includes('/'))
  if (joined.length === 1 && joined[0].includes('..')) {
    const [a, b] = joined[0].split('..').filter(Boolean)
    base = a
    headRef = b || ctx.headSha
  } else if (joined.length === 1) {
    base = joined[0] // diff <ref> → ref...HEAD
  } else if (joined.length >= 2) {
    base = joined[0]
    headRef = joined[1]
  }

  if (!base) {
    return { output: '(no changes — the snapshot is a clean checkout; pass a ref to diff, e.g. `git diff HEAD~1`)', exitCode: 0 }
  }

  const res = await fetch(`${GH}/repos/${ctx.owner}/${ctx.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(headRef)}`, {
    headers: headers(ctx.token),
  })
  if (!res.ok) return { output: `fatal: could not compare (GitHub ${res.status})`, exitCode: 128 }
  const cmp = (await res.json()) as GhCompare

  const files = cmp.files ?? []
  if (files.length === 0) return { output: '(no differences)', exitCode: 0 }

  if (nameOnly) return { output: files.map((f) => f.filename).join('\n'), exitCode: 0 }
  if (statOnly) {
    const lines = files.map((f) => ` ${f.filename} | ${f.changes} ${'+'.repeat(Math.min(f.additions, 40))}${'-'.repeat(Math.min(f.deletions, 40))}`)
    lines.push(` ${files.length} file${files.length === 1 ? '' : 's'} changed`)
    return { output: lines.join('\n'), exitCode: 0 }
  }

  const lines: string[] = []
  for (const f of files) {
    lines.push(`diff --git a/${f.filename} b/${f.filename}`)
    lines.push(`--- a/${f.filename}`)
    lines.push(`+++ b/${f.filename}`)
    if (f.patch) lines.push(f.patch)
    lines.push('')
  }
  return { output: lines.join('\n'), exitCode: 0 }
}

async function gitShow(parsed: ParsedCommand, ctx: GitContext): Promise<ExecResult> {
  const ref = parsed.positionals[0] ?? ctx.headSha
  const res = await fetch(`${GH}/repos/${ctx.owner}/${ctx.repo}/commits/${encodeURIComponent(ref)}`, { headers: headers(ctx.token) })
  if (!res.ok) return { output: `fatal: bad revision '${ref}' (GitHub ${res.status})`, exitCode: 128 }
  const c = (await res.json()) as GhCommit & { files?: GhFile[] }

  const lines: string[] = []
  lines.push(`commit ${c.sha}`)
  lines.push(`Author: ${c.commit.author?.name ?? '?'} <${c.commit.author?.email ?? ''}>`)
  lines.push(`Date:   ${c.commit.author?.date ?? ''}`)
  lines.push('')
  lines.push(`    ${c.commit.message.split('\n').join('\n    ')}`)
  lines.push('')
  if (!parsed.flags.includes('--name-only')) {
    for (const f of c.files ?? []) {
      lines.push(`diff --git a/${f.filename} b/${f.filename}`)
      if (f.patch) lines.push(f.patch)
      lines.push('')
    }
  } else {
    for (const f of c.files ?? []) lines.push(f.filename)
  }
  return { output: lines.join('\n'), exitCode: 0 }
}

async function gitBranch(parsed: ParsedCommand, ctx: GitContext): Promise<ExecResult> {
  const res = await fetch(`${GH}/repos/${ctx.owner}/${ctx.repo}/branches?per_page=100`, { headers: headers(ctx.token) })
  if (!res.ok) return { output: `fatal: could not list branches (GitHub ${res.status})`, exitCode: 128 }
  const branches = (await res.json()) as { name: string }[]
  const lines = branches.map((b) => (b.name === ctx.defaultBranch ? `* ${b.name}` : `  ${b.name}`))
  return { output: lines.join('\n'), exitCode: 0 }
}

// ─── GitHub response shapes (partial) ───────────────────────────────────────
interface GhCommit {
  sha: string
  commit: { message: string; author?: { name?: string; email?: string; date?: string } }
}
interface GhFile {
  filename: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}
interface GhCompare {
  files?: GhFile[]
}
