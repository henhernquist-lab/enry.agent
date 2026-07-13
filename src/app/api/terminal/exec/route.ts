import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { validateCommand } from '@/lib/terminal/parse'
import { parseMetaCommand, looksLikeMetaCommand, type MetaCommand } from '@/lib/terminal/meta-parse'
import { ensureSnapshot } from '@/lib/terminal/snapshot'
import { runCommand } from '@/lib/terminal/exec'
import { runGit } from '@/lib/terminal/git-api'
import { resolveExecutionDir } from '@/lib/terminal/working-copy'
import { proposeEdit, applyEdit, discardEdit, createBranch, commitChanges, openPullRequest, planEdit, type WriteOpsContext } from '@/lib/terminal/write-ops'
import { resolveNLEditTarget } from '@/lib/terminal/nl-edit'
import { FILE_COMMANDS, BLOCKED_BINARIES, RATE_LIMIT_PER_MINUTE } from '@/lib/terminal/allowlist'
import { getSkill, SKILLS } from '@/lib/skills/registry'
import { generateText } from 'ai'
import { nimClientFor, DEFAULT_NIM_MODEL } from '@/lib/nim'
import type { TerminalSessionPayload, TerminalCommand } from '@/lib/resources'

export const maxDuration = 60

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
  const requestedSessionId: string | null = body.session_id ?? null
  const model = typeof body.model === 'string' ? body.model : undefined
  const effort = ['low', 'medium', 'high', 'none', 'deep'].includes(body.effort) ? body.effort : undefined
  const mode = body.mode === 'manual' ? 'manual' as const : 'auto' as const
  const proceed = body.proceed === true
  const resolvedFile = typeof body.target_file === 'string' ? body.target_file : undefined
  const resolvedIsNew = body.is_new_file === true
  const resolvedInstruction = typeof body.instruction === 'string' ? body.instruction : undefined
  const skillSlug = typeof body.skill_slug === 'string' ? body.skill_slug : undefined

  if (!REPO_RE.test(repo)) {
    return Response.json({ error: 'Invalid repo. Use owner/name.' }, { status: 400 })
  }

  if (rateLimited(uid)) {
    return Response.json(
      { error: `Rate limit: max ${RATE_LIMIT_PER_MINUTE} commands per minute.`, exit_code: 126 },
      { status: 429 },
    )
  }

  // Session row must exist BEFORE dispatch (not after, as in the read-only
  // build) — write actions need a durable session_id to read/write pending
  // diff state and working files against.
  const sessionId = await ensureSessionId(uid, repo, requestedSessionId)
  if (!sessionId) return Response.json({ error: 'Could not start terminal session' }, { status: 500 })

  const [owner, name] = repo.split('/')

  const snap = await ensureSnapshot(githubToken, owner, name)
  if (!snap.ok) {
    return Response.json({ output: snap.error, exit_code: 1, session_id: sessionId })
  }

  // Session-scoped writable overlay if this session has any applied-but-
  // uncommitted files; otherwise the shared pristine snapshot directly.
  const execDir = await resolveExecutionDir(sessionId, snap.dir)

  const writeCtx: WriteOpsContext = {
    accessToken: githubToken,
    owner,
    repo: name,
    defaultBranch: snap.defaultBranch,
    sessionId,
    userId: uid,
    snapshotDir: execDir,
    pristineSnapshotDir: snap.dir,
    model,
    effort,
    mode,
    proceed,
    resolvedFile,
    resolvedIsNew,
    resolvedInstruction,
  }

  const { result, action, planTarget } = await dispatch(command, writeCtx, snap.headSha, mode, proceed ?? false, skillSlug)

  const entry: TerminalCommand = {
    cmd: command,
    output: result.output,
    timestamp: new Date().toISOString(),
    exit_code: result.exitCode,
    ...(action ? { action } : {}),
  }

  await appendCommand(uid, sessionId, entry)

  // Read back the session's current write-mode state so the client's prompt
  // line and pending/applied indicators reflect true persisted state, not
  // just an inference from this one command's success — a stale-diff
  // rejection or a fresh page load both need to resolve to the same truth.
  const { current_branch, has_pending_diff, pending_file } = await readWriteState(uid, sessionId)

  return Response.json({
    output: result.output,
    exit_code: result.exitCode,
    session_id: sessionId,
    action,
    current_branch,
    has_pending_diff,
    pending_file,
    reasoning: result.reasoning ?? null,
    ...(planTarget ? { target_file: planTarget.file, is_new_file: planTarget.isNewFile } : {}),
  })
}

async function readWriteState(uid: string, sessionId: string): Promise<{ current_branch?: string; has_pending_diff: boolean; pending_file: string | null }> {
  const { data } = await supabase
    .from('resources')
    .select('payload')
    .eq('id', sessionId)
    .eq('user_id', uid)
    .maybeSingle()
  const payload = data?.payload as TerminalSessionPayload | undefined
  return {
    current_branch: payload?.current_branch,
    has_pending_diff: !!payload?.pending_diff,
    pending_file: payload?.pending_diff?.file ?? null,
  }
}

interface DispatchResult {
  result: { output: string; exitCode: number; reasoning?: string }
  action?: TerminalCommand['action']
  planTarget?: { file: string; isNewFile: boolean }
}

// Dispatch order:
// 1. Skill response — when skill_slug is set, generate a read-only text
//    analysis using the skill's system prompt. No file editing. This MUST
//    run before the NL classifier so that natural-language skill triggers
//    ("should I add X?") don't get rejected as non-code-edit requests.
// 2. Meta-command → read-only allowlist → natural language (code edit).
async function dispatch(command: string, ctx: WriteOpsContext, headSha: string, mode: 'auto' | 'manual' = 'auto', proceed = false, skillSlug?: string): Promise<DispatchResult> {
  // ── Skill response path (read-only, text analysis) ───────────
  if (skillSlug) {
    const result = await runSkillResponse(ctx, skillSlug, command)
    return { result }
  }
  const meta = parseMetaCommand(command)
  if (meta.ok) {
    return { result: await runMeta(meta.command, ctx), action: metaAction(meta.command.kind) }
  }
  if ('error' in meta) {
    // Recognized meta keyword, malformed usage — stays rejected, not NL.
    return { result: { output: meta.error, exitCode: 126 } }
  }

  const parsed = validateCommand(command)
  if (parsed.ok) {
    const result =
      parsed.parsed.spec.executor === 'git'
        ? await runGit(parsed.parsed, { token: ctx.accessToken, owner: ctx.owner, repo: ctx.repo, headSha, defaultBranch: ctx.defaultBranch })
        : await runCommand(parsed.parsed, ctx.snapshotDir)
    return { result }
  }

  const firstToken = command.trim().split(/\s+/)[0] ?? ''
  const isKnownFirstWord = firstToken === 'git' || firstToken in FILE_COMMANDS || BLOCKED_BINARIES.has(firstToken) || looksLikeMetaCommand(command)
  if (isKnownFirstWord) {
    return { result: { output: parsed.error, exitCode: 126 } }
  }

  // Fallback: if the command looks like it was wrapped with a skill prompt
  // but no skill_slug was sent (defensive), try to detect it from the wrapper.
  const wrapperMatch = command.match(/^\[Acting as ([A-Z\s]+) lens\]/)
  if (wrapperMatch) {
    const name = wrapperMatch[1].trim()
    const detected = SKILLS.find((s) => s.name.toUpperCase() === name)
    if (detected) {
      const result = await runSkillResponse(ctx, detected.slug, command)
      return { result }
    }
  }

  // Genuinely unrecognized input -> treat as a natural-language coding
  // request. resolveNLEditTarget enforces the coding-only scope boundary
  // itself (refuses non-code requests) before any file is touched.
  const nl = await resolveNLEditTarget(ctx, command)
  if (!nl.ok) return { result: { output: nl.error, exitCode: 1 } }

  if (ctx.mode === 'manual' && !ctx.proceed) {
    // Manual mode, phase 1: generate a plan, no diff yet.
    const planResult = await planEdit(ctx, nl.target.file, ctx.resolvedInstruction ?? command, nl.target.isNewFile)
    return { result: planResult, action: 'plan', planTarget: nl.target }
  }

  // Auto mode, or manual mode phase 2 (proceed: true): generate the diff.
  const file = ctx.resolvedFile ?? nl.target.file
  const isNew = ctx.proceed ? (ctx.resolvedIsNew ?? false) : nl.target.isNewFile
  const instr = ctx.resolvedInstruction ?? command
  const result = await proposeEdit(ctx, file, instr, isNew)
  return { result, action: 'propose_edit' }
}

function metaAction(kind: string): TerminalCommand['action'] | undefined {
  switch (kind) {
    case 'edit':
    case 'write':
      return 'propose_edit'
    case 'apply':
      return 'apply'
    case 'discard':
      return 'discard'
    case 'branch':
      return 'branch'
    case 'commit':
      return 'commit'
    case 'pr':
      return 'pr'
    default:
      return undefined
  }
}

async function runMeta(
  command: MetaCommand,
  ctx: WriteOpsContext,
): Promise<{ output: string; exitCode: number; reasoning?: string }> {
  switch (command.kind) {
    case 'edit':
      return proposeEdit(ctx, command.file, command.instruction, false)
    case 'write':
      return proposeEdit(ctx, command.file, command.instruction, true)
    case 'apply':
      return applyEdit(ctx)
    case 'discard':
      return discardEdit(ctx)
    case 'branch':
      return createBranch(ctx, command.name)
    case 'commit':
      return commitChanges(ctx, command.message)
    case 'pr':
      return openPullRequest(ctx, command.title, command.description)
  }
}

// Get-or-create: on a brand new session (requestedSessionId is null), insert
// a bare row immediately and return its id, so every downstream write-ops
// call has a durable session_id to work with before the command even runs.
async function ensureSessionId(uid: string, repo: string, requestedSessionId: string | null): Promise<string | null> {
  if (requestedSessionId) {
    const { data } = await supabase
      .from('resources')
      .select('id')
      .eq('id', requestedSessionId)
      .eq('user_id', uid)
      .maybeSingle()
    if (data) return data.id
  }

  const payload: TerminalSessionPayload = {
    repo,
    commands: [],
    session_start: new Date().toISOString(),
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
}

// ── Skill response path ────────────────────────────────────────
// When a Drive skill is active, generate a read-only text analysis
// using the LLM. No files are touched — skills are lenses on the
// codebase, not editors. The command here is the full wrapped prompt
// (system prompt + user request), which we pass directly as the LLM
// instruction.
async function runSkillResponse(
  ctx: WriteOpsContext,
  skillSlug: string,
  wrappedCommand: string,
): Promise<{ output: string; exitCode: number; reasoning?: string }> {
  const skill = getSkill(skillSlug)
  if (!skill) {
    return { output: `Unknown skill: ${skillSlug}`, exitCode: 1 }
  }

  // Extract just the user request from the wrapped prompt for cleaner output.
  const userMarker = 'USER REQUEST:'
  const userIdx = wrappedCommand.indexOf(userMarker)
  const userRequest = userIdx !== -1
    ? wrappedCommand.slice(userIdx + userMarker.length).trim()
    : wrappedCommand

  try {
    const client = nimClientFor(ctx.model)
    const { text } = await generateText({
      model: client.chat(ctx.model ?? DEFAULT_NIM_MODEL),
      system: skill.systemPrompt,
      prompt: `Repository: ${ctx.owner}/${ctx.repo}\n\nUser request: ${userRequest}\n\nProvide your analysis now.`,
      temperature: 0.7,
      maxOutputTokens: 3000,
      timeout: 60_000,
      maxRetries: 1,
    })
    return { output: text, exitCode: 0 }
  } catch (err) {
    console.error('[terminal/skill-response] generation threw:', err)
    const detail = err instanceof Error ? err.message : String(err)
    return { output: `Skill analysis failed: ${detail}`, exitCode: 1 }
  }
}

async function appendCommand(uid: string, sessionId: string, entry: TerminalCommand): Promise<void> {
  try {
    const { data } = await supabase
      .from('resources')
      .select('payload')
      .eq('id', sessionId)
      .eq('user_id', uid)
      .maybeSingle()
    if (!data) return
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
  } catch (e) {
    console.error('[terminal] append failed:', e)
  }
}
