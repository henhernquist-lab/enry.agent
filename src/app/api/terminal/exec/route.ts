import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { validateCommand } from '@/lib/terminal/parse'
import { ensureSnapshot } from '@/lib/terminal/snapshot'
import { runCommand } from '@/lib/terminal/exec'
import { runGit } from '@/lib/terminal/git-api'
import { RATE_LIMIT_PER_MINUTE } from '@/lib/terminal/allowlist'
import type { TerminalSessionPayload, TerminalCommand } from '@/lib/resources'

export const maxDuration = 30

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

// In-memory sliding-window rate limiter. Per serverless instance, which is
// acceptable for a single-user app; the ceiling is a safety valve, not a
// billing control.
const rateBuckets = new Map<string, number[]>()

function rateLimited(uid: string): boolean {
  const now = Date.now()
  const windowStart = now - 60_000
  const hits = (rateBuckets.get(uid) ?? []).filter((t) => t > windowStart)
  if (hits.length >= RATE_LIMIT_PER_MINUTE) {
    rateBuckets.set(uid, hits)
    return true
  }
  hits.push(now)
  rateBuckets.set(uid, hits)
  return false
}

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function POST(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  if (!githubToken) {
    return Response.json({ error: 'GitHub not connected. Sign in with GitHub to use the terminal.' }, { status: 400 })
  }

  const body = await req.json()
  const repo = String(body.repo ?? '').trim()
  const command = String(body.command ?? '')
  const sessionId: string | null = body.session_id ?? null

  if (!REPO_RE.test(repo)) {
    return Response.json({ error: 'Invalid repo. Use owner/name.' }, { status: 400 })
  }

  if (rateLimited(uid)) {
    return Response.json(
      { error: `Rate limit: max ${RATE_LIMIT_PER_MINUTE} commands per minute.`, exit_code: 126 },
      { status: 429 },
    )
  }

  // Validate BEFORE any execution or network call.
  const parsed = validateCommand(command)
  if (!parsed.ok) {
    return Response.json({ blocked: true, output: parsed.error, exit_code: 126, session_id: sessionId })
  }

  const [owner, name] = repo.split('/')

  // Snapshot the repo (cached per head SHA).
  const snap = await ensureSnapshot(githubToken, owner, name)
  if (!snap.ok) {
    return Response.json({ output: snap.error, exit_code: 1, session_id: sessionId })
  }

  // Execute: git → GitHub API; everything else → real binary / tree walk.
  const result =
    parsed.parsed.spec.executor === 'git'
      ? await runGit(parsed.parsed, {
          token: githubToken,
          owner,
          repo: name,
          headSha: snap.headSha,
          defaultBranch: snap.defaultBranch,
        })
      : await runCommand(parsed.parsed, snap.dir)

  const entry: TerminalCommand = {
    cmd: command,
    output: result.output,
    timestamp: new Date().toISOString(),
    exit_code: result.exitCode,
  }

  const newSessionId = await persistCommand(uid, repo, entry, sessionId)

  return Response.json({ output: result.output, exit_code: result.exitCode, session_id: newSessionId })
}

// One terminal_session row per session: created on the first command, appended
// to (and session_end bumped) on each subsequent one.
async function persistCommand(
  uid: string,
  repo: string,
  entry: TerminalCommand,
  sessionId: string | null,
): Promise<string | null> {
  try {
    if (sessionId) {
      const { data } = await supabase
        .from('resources')
        .select('payload')
        .eq('id', sessionId)
        .eq('user_id', uid)
        .maybeSingle()
      if (data) {
        const payload = data.payload as TerminalSessionPayload
        const updated: TerminalSessionPayload = {
          ...payload,
          commands: [...(payload.commands ?? []), entry].slice(-200),
          session_end: entry.timestamp,
        }
        await supabase
          .from('resources')
          .update({ payload: updated, updated_at: new Date().toISOString() })
          .eq('id', sessionId)
          .eq('user_id', uid)
        return sessionId
      }
    }

    const payload: TerminalSessionPayload = {
      repo,
      commands: [entry],
      session_start: entry.timestamp,
      session_end: entry.timestamp,
    }
    const { data, error } = await supabase
      .from('resources')
      .insert({ user_id: uid, type: 'terminal_session', source: 'user', title: `Terminal — ${repo}`, payload })
      .select('id')
      .single()
    if (error) {
      console.error('[terminal] session insert failed:', error)
      return null
    }
    return data.id
  } catch (e) {
    console.error('[terminal] persist failed:', e)
    return sessionId
  }
}
