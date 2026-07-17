import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { validateCommand } from '@/lib/terminal/parse'
import { parseMetaCommand, looksLikeMetaCommand, type MetaCommand } from '@/lib/terminal/meta-parse'
import { ensureSnapshot } from '@/lib/terminal/snapshot'
import { runCommand } from '@/lib/terminal/exec'
import { runGit } from '@/lib/terminal/git-api'
import { resolveExecutionDir } from '@/lib/terminal/working-copy'
import { proposeEdit, applyEdit, discardEdit, createBranch, commitChanges, openPullRequest, planEdit, generateReasoningTrace, loadEnryRules, buildEnryRulesBlock, casUpdateSessionPayload, type WriteOpsContext } from '@/lib/terminal/write-ops'
import { resolveNLEditTarget } from '@/lib/terminal/nl-edit'
import { FILE_COMMANDS, BLOCKED_BINARIES, RATE_LIMIT_PER_MINUTE } from '@/lib/terminal/allowlist'
import { getSkill, SKILLS, buildMultiSkillPrompt } from '@/lib/skills/registry'
import { getSkillWithOverride } from '@/lib/skills/loader'
import { generateText } from 'ai'
import { nimClientFor, DEFAULT_NIM_MODEL } from '@/lib/nim'
import { insertSkillInvocation, updateSkillInvocationOutput } from '@/lib/lab/db'
import { parseReasoningTrace, renderReasoningTrace, reasoningExtraBody, type ReasoningDepth } from '@/lib/reasoning-trace'
import type { TerminalSessionPayload, TerminalCommand } from '@/lib/resources'

export const maxDuration = 60

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

// Synthetic absolute root for confinePath on the snapshot-free generation hop.
// confinePath is a pure-string escape check (path.resolve/relative), so no real
// directory needs to exist — a constant root gives identical safety semantics
// (any path resolving outside it still yields a leading '..' and is rejected)
// without downloading the repo tarball. See the isGenerationHop branch in POST.
const GENERATION_HOP_ROOT = '/enry-generation-hop'

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
  const focusMode = ['all','memory_only','web_only','repo_only'].includes(body.focus_mode) ? body.focus_mode as string : undefined
  const reasoningDepth: ReasoningDepth = ['off','summary','full'].includes(body.reasoning_depth) ? body.reasoning_depth : 'off'
  const proceed = body.proceed === true
  const resolvedFile = typeof body.target_file === 'string' ? body.target_file : undefined
  const resolvedIsNew = body.is_new_file === true
  const resolvedInstruction = typeof body.instruction === 'string' ? body.instruction : undefined
  const resolvedReasoningTrace = typeof body.reasoning_trace === 'string' ? body.reasoning_trace : undefined
  const skillSlug = typeof body.skill_slug === 'string' ? body.skill_slug : undefined
  const skillSlugs: string[] | undefined = Array.isArray(body.skill_slugs) ? body.skill_slugs.filter((s: unknown) => typeof s === 'string') : undefined

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

  // The generation hop (a resolved NL-edit target coming back for diff
  // generation via proposeEdit — auto hop-2 or manual proceed) reads the
  // target file through the GitHub API and only needs a pure-string path check,
  // NEVER the repo contents. So skip ensureSnapshot's tarball download +
  // extract for it (measured ~884ms cold / ~308ms warm on a real repo — a
  // modest but guaranteed slice of the 60s budget, and it removes a
  // variable-latency dependency from the most timeout-sensitive path). Every
  // other command type (read commands over the snapshot, apply) still gets the
  // real snapshot. dispatch() routes this hop straight to proposeEdit before
  // any snapshot-dependent parsing, so the synthetic dir is never dereferenced.
  const isGenerationHop = (proceed ?? false) && !!resolvedFile

  let writeCtx: WriteOpsContext
  let headSha = ''
  if (isGenerationHop) {
    writeCtx = {
      accessToken: githubToken,
      owner,
      repo: name,
      defaultBranch: '',            // unused by proposeEdit
      sessionId,
      userId: uid,
      snapshotDir: GENERATION_HOP_ROOT,       // confinePath root only (pure string)
      pristineSnapshotDir: GENERATION_HOP_ROOT, // unused by proposeEdit
      model,
      effort,
      mode,
      proceed,
      resolvedFile,
      resolvedIsNew,
      resolvedInstruction,
      resolvedReasoningTrace,
    }
  } else {
    const snap = await ensureSnapshot(githubToken, owner, name)
    if (!snap.ok) {
      return Response.json({ output: snap.error, exit_code: 1, session_id: sessionId })
    }
    // Session-scoped writable overlay if this session has any applied-but-
    // uncommitted files; otherwise the shared pristine snapshot directly.
    const execDir = await resolveExecutionDir(sessionId, snap.dir)
    headSha = snap.headSha
    writeCtx = {
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
      resolvedReasoningTrace,
    }
  }

  const { result, action, planTarget, invocationId, reasoningTrace } = await dispatch(command, writeCtx, headSha, mode, proceed ?? false, skillSlug, skillSlugs, reasoningDepth)

  // Check for .enryrules and include its existence in the response so the
  // client can show/hide the editor UI. Shares write-ops.ts's cached
  // loadEnryRules — same call the skill/edit paths below already make for
  // this repo, instead of a second uncached, uncorrelated fetch.
  const hasEnryRules = (await loadEnryRules(writeCtx)) !== null

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
    reasoning_trace: reasoningTrace,
    reasoning_depth: reasoningDepth,
    ...(invocationId ? { invocation_id: invocationId } : {}),
    ...(planTarget ? { target_file: planTarget.file, is_new_file: planTarget.isNewFile } : {}),
    has_enryrules: hasEnryRules,
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
  invocationId?: string
  reasoningTrace?: string | null
}

// Dispatch order:
// 1. Skill response — when skill_slug is set, generate a read-only text
//    analysis using the skill's system prompt. No file editing. This MUST
//    run before the NL classifier so that natural-language skill triggers
//    ("should I add X?") don't get rejected as non-code-edit requests.
// 2. Meta-command → read-only allowlist → natural language (code edit).
async function dispatch(command: string, ctx: WriteOpsContext, headSha: string, mode: 'auto' | 'manual' = 'auto', proceed = false, skillSlug?: string, skillSlugs?: string[], reasoningDepth?: ReasoningDepth): Promise<DispatchResult> {
  // ── Multi-skill response path (read-only, text analysis) ──
  if (skillSlugs && skillSlugs.length > 1) {
    const skillResult = await runMultiSkillResponse(ctx, skillSlugs, command, reasoningDepth)
    return { result: skillResult, invocationId: skillResult.invocationId, reasoningTrace: skillResult.reasoningTrace }
  }

  // ── Skill response path (read-only, text analysis) ───────────
  if (skillSlug || (skillSlugs && skillSlugs.length === 1)) {
    const slug = skillSlug ?? skillSlugs![0]
    const skillResult = await runSkillResponse(ctx, slug, command, reasoningDepth)
    return { result: skillResult, invocationId: skillResult.invocationId, reasoningTrace: skillResult.reasoningTrace }
  }

  // ── Generation hop (already-resolved target) ─────────────────
  // A resolved target already in hand — hop 2 of the auto-mode chain, or
  // manual-mode proceed — goes straight to proposeEdit, skipping both the NL
  // classifier (already ran in hop 1) AND the meta/command parsing below. That
  // parsing assumes a real downloaded snapshot (runCommand reads over it); this
  // path uses only the GitHub API + a pure-string confinePath, so the route
  // deliberately skips the snapshot tarball download for it (see the POST
  // handler's isGenerationHop branch). Routing here first is what makes that
  // skip airtight — this hop can never fall through to a snapshot-dependent
  // branch even if the original NL text happened to look like a command.
  if (ctx.resolvedFile) {
    const file = ctx.resolvedFile
    const isNew = ctx.resolvedIsNew ?? false
    const instr = ctx.resolvedInstruction ?? command

    // Think, for a plain code edit (no skill active — those already get their
    // own reasoning via runSkillResponse). Runs as a genuinely separate call
    // in its OWN hop, before generation, not inline in this one: this branch
    // still owns the same 60s budget as the diff-generation call would, and
    // chaining two ~25-40s LLM calls in one invocation is exactly the
    // over-budget failure class fixed elsewhere tonight. A trace already in
    // hand (ctx.resolvedReasoningTrace set) means the client is back for the
    // real generation hop, so this only fires once per chain.
    if (reasoningDepth && reasoningDepth !== 'off' && !ctx.resolvedReasoningTrace) {
      const traceResult = await generateReasoningTrace(ctx, file, instr, isNew)
      if ('error' in traceResult) {
        // A failed reasoning pass shouldn't block the edit itself — fall
        // through to generation without a trace instead of hard-failing.
        const result = await proposeEdit(ctx, file, instr, isNew)
        return { result, action: 'propose_edit' }
      }
      return { result: { output: '', exitCode: 0, reasoning: traceResult.trace }, action: 'reasoning_ready' }
    }

    const result = await proposeEdit(ctx, file, instr, isNew, ctx.resolvedReasoningTrace)
    return { result, action: 'propose_edit' }
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
  if (!nl.ok) {
    // Ambiguous-but-plausible requests (can't tell which file) get the same
    // [CLARIFY]/exit_code:0 wire format the skill-invocation path already
    // uses — see agent/page.tsx's clarifyMatch parser — instead of the
    // exitCode:1 hard-refuse path, which that parser deliberately excludes.
    if (nl.clarify) {
      const optionsText = nl.clarify.options.length > 0
        ? nl.clarify.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join(', ')
        : 'A) point me to the file, B) describe it more specifically'
      return { result: { output: `[CLARIFY] ${nl.clarify.question} Options: ${optionsText}`, exitCode: 0 } }
    }
    return { result: { output: nl.error, exitCode: 1 } }
  }

  if (ctx.mode === 'manual') {
    // Manual mode, phase 1: generate a plan, no diff yet.
    const planResult = await planEdit(ctx, nl.target.file, command, nl.target.isNewFile)
    return { result: planResult, action: 'plan', planTarget: nl.target }
  }

  // Auto mode: do NOT generate the diff in this same invocation. Classifying
  // the target (up to 20s) and generating a full file rewrite (up to 45s) are
  // two independent LLM calls; chained in one request they can together
  // exceed this route's maxDuration (60s — already the ceiling on this
  // project's Vercel plan, so raising it further is a no-op, same constraint
  // Cruise hit). Returning here and having the client immediately re-POST
  // with the resolved target (below) gives stage 2 its own fresh 60s budget
  // instead of running on whatever's left after stage 1.
  return { result: { output: '', exitCode: 0 }, action: 'target_resolved', planTarget: nl.target }
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
  reasoningDepth?: ReasoningDepth,
): Promise<{ output: string; exitCode: number; reasoning?: string; invocationId?: string; reasoningTrace?: string | null }> {
  const skill = await getSkillWithOverride(ctx.userId, skillSlug)
  if (!skill) {
    return { output: `Unknown skill: ${skillSlug}`, exitCode: 1 }
  }

  // Extract just the user request from the wrapped prompt for cleaner output.
  const userMarker = 'USER REQUEST:'
  const userIdx = wrappedCommand.indexOf(userMarker)
  const userRequest = userIdx !== -1
    ? wrappedCommand.slice(userIdx + userMarker.length).trim()
    : wrappedCommand

  // Detect whether an Enry Lab prompt override is active for this skill.
  const baseSkill = getSkill(skillSlug)
  const hasOverride = baseSkill && skill.systemPrompt !== baseSkill.systemPrompt

  // Log the invocation before generating.
  let invocationId: string | null = null
  try {
    invocationId = await insertSkillInvocation(ctx.userId, {
      skill_slug: skillSlug,
      prompt_version: hasOverride ? 'override' : 'base',
      input_topic: userRequest.slice(0, 2000),
      output_text: '',
      model_used: ctx.model ?? DEFAULT_NIM_MODEL,
      effort_used: ctx.effort ?? 'none',
      mode: ctx.mode ?? null,
      source: 'drive',
      explicit_feedback: null,
      implicit_score: 0,
      conversation_id: ctx.sessionId,
    })
  } catch (err) {
    console.error('[terminal/skill-response] failed to log invocation:', err)
  }

  // Load .enryrules for this repo so skill invocations follow repo-specific
  // conventions — shares write-ops.ts's single cached implementation.
  const rules = await loadEnryRules(ctx)
  const enryrulesContent = rules ? buildEnryRulesBlock(rules) : ''

  try {
    const client = nimClientFor(ctx.model)
    const { text } = await generateText({
      model: client.chat(ctx.model ?? DEFAULT_NIM_MODEL),
      system: skill.systemPrompt + enryrulesContent,
      prompt: `Repository: ${ctx.owner}/${ctx.repo}\n\nUser request: ${userRequest}\n\nProvide your analysis now.`,
      temperature: 0.7,
      maxOutputTokens: 3000,
      // 40s, not 60s — this call does not own the full 60s maxDuration alone.
      // The same invocation already ran ensureSnapshot + a getFileContent for
      // .enryrules before reaching here, and still owes appendCommand +
      // readWriteState after it returns. At 60s (equal to the platform
      // ceiling) plus that overhead, Vercel kills the function before this
      // AbortController can ever fire — the exact same failure mode fixed on
      // generateFileContent (write-ops.ts) earlier; mirrored here.
      // maxRetries: 0 so a retry can't silently double wall-clock past 60s.
      timeout: 40_000,
      maxRetries: 0,
      ...(reasoningDepth !== 'off' ? (reasoningExtraBody(ctx.model ?? DEFAULT_NIM_MODEL) ?? {}) : {}),
    })

    // Parse reasoning trace from the response
    const { reasoning: trace, answer } = parseReasoningTrace(text)
    if (invocationId) {
      await updateSkillInvocationOutput(invocationId, answer)
    }
    return { output: answer, exitCode: 0, invocationId: invocationId ?? undefined, reasoningTrace: trace }
  } catch (err) {
    console.error('[terminal/skill-response] generation threw:', err)
    // Distinguish a timeout abort from a genuine upstream error, same as
    // generateFileContent — a timeout calls for "narrow the request or turn
    // Think off", not a raw "Aborted"/TimeoutError string.
    const name = err instanceof Error ? err.name : ''
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = name === 'TimeoutError' || name === 'AbortError' || /abort|timed?\s?out/i.test(msg)
    const detail = isTimeout
      ? 'generation timed out before finishing this analysis — try a narrower request, or turn Think off if it\'s on (reasoning tokens eat into the same budget).'
      : msg
    return { output: `Skill analysis failed: ${detail}`, exitCode: 1, invocationId: invocationId ?? undefined }
  }
}

// ── Multi-skill response path ─────────────────────────────────
// When 2+ Drive skills are active simultaneously, build a combined
// prompt using buildMultiSkillPrompt() and generate a single response
// with separate labeled output sections for each skill.
async function runMultiSkillResponse(
  ctx: WriteOpsContext,
  skillSlugs: string[],
  wrappedCommand: string,
  reasoningDepth?: ReasoningDepth,
): Promise<{ output: string; exitCode: number; reasoning?: string; invocationId?: string; reasoningTrace?: string | null }> {
  const skills = await Promise.all(skillSlugs.map((s) => getSkillWithOverride(ctx.userId, s)))
  const validSkills = skills.filter(Boolean)
  if (validSkills.length === 0) {
    return { output: `No valid skills found: ${skillSlugs.join(', ')}`, exitCode: 1 }
  }

  // Build SkillInvocation objects for buildMultiSkillPrompt
  const userMarker = 'USER REQUEST:'
  const userIdx = wrappedCommand.indexOf(userMarker)
  const userRequest = userIdx !== -1
    ? wrappedCommand.slice(userIdx + userMarker.length).trim()
    : wrappedCommand

  const invocations = validSkills.map((skill) => ({
    skill: skill!,
    topic: userRequest,
    via: 'command' as const,
  }))

  const combinedPrompt = buildMultiSkillPrompt(invocations)

  // Detect whether any of the loaded skills has an active prompt override.
  const anyOverride = skillSlugs.some((slug) => {
    const base = getSkill(slug)
    const override = validSkills.find((s) => s && s.slug === slug)
    return base && override && base.systemPrompt !== override.systemPrompt
  })

  // Log the invocation before generating.
  let invocationId: string | null = null
  try {
    invocationId = await insertSkillInvocation(ctx.userId, {
      skill_slug: skillSlugs.join('+'),
      prompt_version: anyOverride ? 'override' : 'base',
      input_topic: userRequest.slice(0, 2000),
      output_text: '',
      model_used: ctx.model ?? DEFAULT_NIM_MODEL,
      effort_used: ctx.effort ?? 'none',
      mode: ctx.mode ?? null,
      source: 'drive',
      explicit_feedback: null,
      implicit_score: 0,
      conversation_id: ctx.sessionId,
    })
  } catch (err) {
    console.error('[terminal/multi-skill-response] failed to log invocation:', err)
  }

  // Load .enryrules for this repo so multi-skill invocations follow repo
  // conventions — shares write-ops.ts's single cached implementation.
  const multiSkillRules = await loadEnryRules(ctx)
  const enryrulesContent = multiSkillRules ? buildEnryRulesBlock(multiSkillRules) : ''

  try {
    const client = nimClientFor(ctx.model)
    const { text } = await generateText({
      model: client.chat(ctx.model ?? DEFAULT_NIM_MODEL),
      system: combinedPrompt + enryrulesContent,
      prompt: `Repository: ${ctx.owner}/${ctx.repo}\n\nUser request: ${userRequest}\n\nProvide your multi-lens analysis now.`,
      temperature: 0.7,
      maxOutputTokens: 4000,
      // Was 90s — LONGER than the platform's hard 60s maxDuration (route.ts's
      // own `export const maxDuration = 60`), which is not a soft target, it's
      // a kill switch. A call configured to run past it can never surface its
      // own clean timeout error: Vercel kills the function first, and the
      // user gets a raw 504 instead of the message in the catch block below.
      // 40s matches the same margin already proven on generateFileContent and
      // runSkillResponse, accounting for this call's own ensureSnapshot +
      // .enryrules overhead before it and appendCommand/readWriteState after.
      // maxRetries: 0 so a retry can't silently double wall-clock past 60s.
      timeout: 40_000,
      maxRetries: 0,
      ...(reasoningDepth !== 'off' ? (reasoningExtraBody(ctx.model ?? DEFAULT_NIM_MODEL) ?? {}) : {}),
    })

    const { reasoning: trace, answer } = parseReasoningTrace(text)
    if (invocationId) {
      await updateSkillInvocationOutput(invocationId, answer)
    }
    return { output: answer, exitCode: 0, invocationId: invocationId ?? undefined, reasoningTrace: trace }
  } catch (err) {
    console.error('[terminal/multi-skill-response] generation threw:', err)
    const name = err instanceof Error ? err.name : ''
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = name === 'TimeoutError' || name === 'AbortError' || /abort|timed?\s?out/i.test(msg)
    const detail = isTimeout
      ? 'generation timed out before finishing this multi-lens analysis — try fewer skills at once, a narrower request, or turn Think off if it\'s on.'
      : msg
    return { output: `Multi-skill analysis failed: ${detail}`, exitCode: 1, invocationId: invocationId ?? undefined }
  }
}

async function appendCommand(uid: string, sessionId: string, entry: TerminalCommand): Promise<void> {
  try {
    // Was its own independent load -> spread -> full-object update of the
    // same row write-ops.ts's saveSessionPayload also writes — two racing
    // requests could each read stale `commands`/`pending_diff`/etc. and clobber
    // each other's changes. Shares the compare-and-swap helper instead: the
    // mutate callback recomputes `commands` from whatever payload is CURRENT
    // on each retry attempt, not a snapshot taken before this function ran.
    await casUpdateSessionPayload(sessionId, uid, (payload) => ({
      commands: [...(payload.commands ?? []), entry].slice(-200),
      session_end: entry.timestamp,
    }))
  } catch (e) {
    console.error('[terminal] append failed:', e)
  }
}
