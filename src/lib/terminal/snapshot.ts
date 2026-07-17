import { gunzipSync } from 'zlib'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

// Live Terminal — repo snapshots.
//
// On the first command for a repo we download the GitHub tarball, extract it to
// a temp dir keyed by the head SHA, and cache it. File commands (ls/cat/grep/
// find/…) then run as real binaries over this snapshot. The tarball approach
// means grep/find across a whole repo is ONE network call, not hundreds of
// per-file API requests.
//
// No tar dependency: gzip via built-in zlib, then a minimal parser over the
// fixed 512-byte tar block format.

const SNAPSHOT_ROOT = path.join(os.tmpdir(), 'terminal-snapshots')
const MAX_TOTAL_BYTES = 100 * 1024 * 1024 // 100MB extraction cap
const MAX_FILE_BYTES = 5 * 1024 * 1024 // skip individual files over 5MB

export interface SnapshotResult {
  ok: true
  dir: string
  headSha: string
  defaultBranch: string
}

export interface SnapshotError {
  ok: false
  error: string
  status?: number
}

const GH = 'https://api.github.com'

// Small metadata calls (repo info, ref resolution) vs. the tarball download —
// the latter is an actual file transfer that can legitimately take longer on
// a large repo, so it gets more room. Neither had any ceiling before: a
// slow/degraded GitHub response burned time invisibly ahead of the tuned
// 25s/40s AI SDK timeouts downstream, eating the margin those numbers assume
// they have.
const GH_METADATA_TIMEOUT_MS = 10_000
const GH_TARBALL_TIMEOUT_MS = 20_000

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(`GitHub request timed out after ${timeoutMs / 1000}s: ${label}`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// Resolve the repo's default branch + current head SHA so the snapshot dir is
// content-addressed (re-clone only when the repo actually moved).
async function resolveHead(token: string, owner: string, repo: string): Promise<{ sha: string; branch: string } | { error: string; status: number }> {
  try {
    const infoRes = await fetchWithTimeout(`${GH}/repos/${owner}/${repo}`, { headers: ghHeaders(token) }, GH_METADATA_TIMEOUT_MS, 'repo info')
    if (!infoRes.ok) return { error: `Repo not accessible (GitHub ${infoRes.status})`, status: infoRes.status }
    const info = await infoRes.json()
    const branch = info.default_branch as string

    const refRes = await fetchWithTimeout(
      `${GH}/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
      { headers: { ...ghHeaders(token), Accept: 'application/vnd.github.sha' } },
      GH_METADATA_TIMEOUT_MS,
      'head ref',
    )
    if (!refRes.ok) return { error: `Could not resolve head (GitHub ${refRes.status})`, status: refRes.status }
    const sha = (await refRes.text()).trim()
    return { sha, branch }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), status: 0 }
  }
}

export async function ensureSnapshot(
  token: string,
  owner: string,
  repo: string,
): Promise<SnapshotResult | SnapshotError> {
  const head = await resolveHead(token, owner, repo)
  if ('error' in head) return { ok: false, error: head.error, status: head.status }

  const dir = path.join(SNAPSHOT_ROOT, `${owner}__${repo}__${head.sha}`)

  // Cache hit: a marker file means extraction completed successfully.
  try {
    await fs.access(path.join(dir, '.snapshot-complete'))
    return { ok: true, dir, headSha: head.sha, defaultBranch: head.branch }
  } catch {
    // not cached — extract below
  }

  let gz: Buffer
  {
    // Timeout window covers the FULL download (headers + body), not just the
    // connection — a large tarball can stream slowly even after headers come
    // back promptly, and a timer cleared right after fetch() resolves would
    // miss exactly that case.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GH_TARBALL_TIMEOUT_MS)
    try {
      const tarRes = await fetch(`${GH}/repos/${owner}/${repo}/tarball/${head.sha}`, { headers: ghHeaders(token), signal: controller.signal })
      if (!tarRes.ok) return { ok: false, error: `Tarball download failed (GitHub ${tarRes.status})`, status: tarRes.status }
      gz = Buffer.from(await tarRes.arrayBuffer())
    } catch (e) {
      if (controller.signal.aborted) {
        return { ok: false, error: `Tarball download timed out after ${GH_TARBALL_TIMEOUT_MS / 1000}s.` }
      }
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      clearTimeout(timer)
    }
  }
  let tar: Buffer
  try {
    tar = gunzipSync(gz)
  } catch {
    return { ok: false, error: 'Failed to decompress repo tarball.' }
  }

  try {
    await extractTar(tar, dir)
    await fs.writeFile(path.join(dir, '.snapshot-complete'), head.sha)
  } catch (e) {
    return { ok: false, error: `Failed to extract snapshot: ${e instanceof Error ? e.message : String(e)}` }
  }

  return { ok: true, dir, headSha: head.sha, defaultBranch: head.branch }
}

// Minimal tar extractor over the standard 512-byte block (ustar) format.
// GitHub tarballs prefix every path with a top-level "<owner>-<repo>-<sha>/"
// directory; we strip that first path component so the snapshot root is the
// repo root.
async function extractTar(buf: Buffer, destRoot: string): Promise<void> {
  await fs.mkdir(destRoot, { recursive: true })
  let offset = 0
  let total = 0
  const BLOCK = 512

  while (offset + BLOCK <= buf.length) {
    const header = buf.subarray(offset, offset + BLOCK)
    // Two consecutive zero blocks mark end of archive.
    if (header.every((b) => b === 0)) break

    const name = readString(header, 0, 100)
    if (!name) {
      offset += BLOCK
      continue
    }
    const sizeStr = readString(header, 124, 12)
    const size = parseInt(sizeStr.trim() || '0', 8) || 0
    const typeFlag = String.fromCharCode(header[156])

    const dataStart = offset + BLOCK
    const stripped = stripFirstComponent(name)

    if (stripped && !isUnsafePath(stripped)) {
      const destPath = path.join(destRoot, stripped)
      if (typeFlag === '5') {
        // directory
        await fs.mkdir(destPath, { recursive: true })
      } else if (typeFlag === '0' || typeFlag === '\0' || typeFlag === '') {
        // regular file
        if (size <= MAX_FILE_BYTES && total + size <= MAX_TOTAL_BYTES) {
          await fs.mkdir(path.dirname(destPath), { recursive: true })
          await fs.writeFile(destPath, buf.subarray(dataStart, dataStart + size))
          total += size
        }
        // Symlinks (typeFlag '1'/'2') are intentionally skipped — no link
        // creation, so a snapshot can never point outside its own root.
      }
    }

    // advance past the data, rounded up to the next 512 boundary
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK
  }
}

function readString(buf: Buffer, start: number, len: number): string {
  const slice = buf.subarray(start, start + len)
  const end = slice.indexOf(0)
  return slice.subarray(0, end === -1 ? len : end).toString('utf-8')
}

function stripFirstComponent(p: string): string {
  const idx = p.indexOf('/')
  return idx === -1 ? '' : p.slice(idx + 1)
}

// Defense in depth: reject any entry name that would escape the root even
// before path.join normalizes it.
function isUnsafePath(p: string): boolean {
  if (p.startsWith('/')) return true
  const parts = p.split('/')
  return parts.some((seg) => seg === '..')
}

// Confine a user-supplied path argument to the snapshot root. Returns the
// resolved absolute path, or null if it escapes.
export function confinePath(root: string, arg: string): string | null {
  const resolved = path.resolve(root, arg)
  const rel = path.relative(root, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return resolved
}
