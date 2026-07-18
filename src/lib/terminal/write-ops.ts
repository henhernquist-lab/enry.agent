import { supabase } from '../supabase'
import { getFileContent, checkWriteScope, createOrSwitchBranch, commitFiles, createPullRequest as ghCreatePullRequest } from '../github'
import { nimClientFor, DEFAULT_NIM_MODEL } from '../nim'
import { generateText } from 'ai'
import { generateDiff, contentHash } from './diff'
import { confinePath } from './snapshot'
import { getWorkingFile, upsertWorkingFile, listWorkingFiles, clearWorkingFiles, resolveExecutionDir } from './working-copy'
import { reasoningExtraBody, parseReasoningTrace } from '../reasoning-trace'
import type { TerminalSessionPayload, PendingDiff } from '../resources'

// Live Terminal write mode — orchestration. Everything that actually touches
// GitHub or the session's persisted write-state goes through here.
//
// Nothing in this file writes to the repo except commitChanges and
// createBranch/createPullRequest. proposeEdit and applyEdit only ever touch
// the pending_diff field and the terminal_working_files table — the actual
// GitHub repo is untouched until a real `commit`.

export interface WriteOpsContext {
  accessToken: string
  owner: string
  repo: string
  defaultBranch: string
  sessionId: string
  userId: string
  // The execution dir the route resolved BEFORE this command ran (pristine,
  // shared cache, or an existing session fork if working files already
  // existed at request start) — fine for read-only path validation, but NOT
  // safe to write through directly. See applyEdit.
  snapshotDir: string
  // The TRUE pristine snapshot dir (never written to directly), independent
  // of whatever snapshotDir above resolved to. applyEdit re-resolves the
  // execution dir from this after every upsert, since the working-file that
  // upsert just created/updated didn't exist yet when snapshotDir was
  // computed — on a session's first-ever apply, snapshotDir above is still
  // the pristine dir, and writing there would leak into every other session
  // sharing this repo+headSha's cache.
  pristineSnapshotDir: string
  // Coding-agent controls (optional — absent falls back to the default model
  // and balanced effort). model is one of the NIM model ids; effort maps to a
  // temperature / token-budget / prompt-strategy tier.
  model?: string
  effort?: EffortLevel
  // Mode: 'auto' = propose diff directly (current behavior); 'manual' =
  // generate a plan first, return to client for approval, then the client
  // sends a second request with proceed:true to generate the actual diff.
  mode?: 'auto' | 'manual'
  proceed?: boolean
  // Already-resolved target (set by dispatch when proceed:true in manual mode
  // — skips the resolveNLEditTarget step).
  resolvedFile?: string
  resolvedIsNew?: boolean
  resolvedInstruction?: string
  // A reasoning trace already generated in a PRIOR hop (generateReasoningTrace,
  // its own call/invocation) — when present, dispatch() skips straight to
  // proposeEdit instead of running the reasoning pre-step again, and it's
  // folded into generateFileContent's prompt as context only.
  resolvedReasoningTrace?: string
}

export type EffortLevel = 'low' | 'medium' | 'high' | 'none' | 'deep'

// Effort → generation parameters. Deeper effort spends more tokens and nudges
// the model to reason about edge cases before proposing; quick effort is
// terse and cheap. Temperature stays low throughout — this is code editing,
// not brainstorming.
const EFFORT_PARAMS: Record<EffortLevel, { temperature: number; maxOutputTokens: number; planDepth: string }> = {
  low:    { temperature: 0.2, maxOutputTokens: 3000, planDepth: 'One sentence: what you will change. Skip rationale.' },
  none:   { temperature: 0.3, maxOutputTokens: 4096, planDepth: '2-3 sentences: what you will change and why.' },
  medium: { temperature: 0.3, maxOutputTokens: 5000, planDepth: '2-4 sentences: what you will change, why, and any risk you considered.' },
  high:   { temperature: 0.4, maxOutputTokens: 8000, planDepth: 'A short paragraph: your reasoning, the approach you chose over alternatives, and edge cases you accounted for.' },
  deep:   { temperature: 0.5, maxOutputTokens: 12000, planDepth: 'A detailed multi-step plan: (1) what you will change and exactly where in the file, (2) your reasoning with code-level specifics, (3) the approach you chose over at least one alternative with justification, (4) edge cases and failure modes you accounted for, (5) potential side effects in the rest of the codebase.' },
}

export interface WriteOpsResult {
  output: string
  exitCode: number
  // A short plan/reasoning the agent produced before the diff (propose_edit
  // only). Powers the collapsible "thinking" section in the cockpit UI.
  reasoning?: string
}

// ── Session payload helpers ──────────────────────────────────────────────────
async function loadSessionPayload(sessionId: string, userId: string): Promise<TerminalSessionPayload | null> {
  const { data, error } = await supabase
    .from('resources')
    .select('payload')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data.payload as TerminalSessionPayload
}

const CAS_MAX_RETRIES = 5

// Optimistic-concurrency read-modify-write on a session's payload row.
// Previously this function AND exec/route.ts's appendCommand each did their
// own independent load -> spread -> full-object update of the SAME row with
// no version check — a lost-update race: two overlapping requests on one
// session (double-clicking Send, or Apply landing while a slow Edit/skill
// call is still in flight) could have the second write's stale snapshot
// silently clobber the first write's changes. `mutate` receives the LATEST
// payload on every attempt (never a snapshot captured before the retry loop
// started), so a retry after a detected conflict always merges onto current
// state instead of re-applying a stale patch. Requires migration
// 018_resources_version.sql (adds `resources.version`).
export async function casUpdateSessionPayload(
  sessionId: string,
  userId: string,
  mutate: (current: TerminalSessionPayload) => Partial<TerminalSessionPayload>,
): Promise<boolean> {
  for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from('resources')
      .select('payload, version')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('[terminal/write-ops] casUpdateSessionPayload read failed (is migration 018_resources_version.sql applied?):', error)
      return false
    }
    if (!data) return false
    const current = data.payload as TerminalSessionPayload
    const version = (data as { version?: number }).version ?? 1
    const patch = mutate(current)

    const { data: updated, error: updateError } = await supabase
      .from('resources')
      .update({ payload: { ...current, ...patch }, version: version + 1, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .eq('version', version) // compare-and-swap: only succeeds if nobody else wrote first
      .select('id')
    if (updateError) {
      console.error('[terminal/write-ops] casUpdateSessionPayload failed:', updateError)
      return false
    }
    if (updated && updated.length > 0) return true
    // 0 rows matched -> version moved under us; retry with a fresh read.
  }
  console.error('[terminal/write-ops] casUpdateSessionPayload: exhausted retries without resolving a conflict', { sessionId })
  return false
}

async function saveSessionPayload(sessionId: string, userId: string, patch: Partial<TerminalSessionPayload>): Promise<void> {
  await casUpdateSessionPayload(sessionId, userId, () => patch)
}

// ── Write-scope gate ──────────────────────────────────────────────────────────
async function requireWriteScope(ctx: WriteOpsContext): Promise<string | null> {
  const { hasRepoScope, error } = await checkWriteScope(ctx.accessToken)
  if (error) return `Could not verify GitHub permissions: ${error}`
  if (!hasRepoScope) {
    return "Your GitHub token doesn't have write access (missing 'repo' scope). Sign out and back in to re-authorize, then try again."
  }
  return null
}

function isDefaultBranch(ctx: WriteOpsContext, branch: string): boolean {
  return branch === ctx.defaultBranch || branch === 'main' || branch === 'master' || branch === 'HEAD'
}

// Shared by proposeEdit and generateReasoningTrace — both need to see the
// SAME base content (an already-applied-but-uncommitted working-copy version
// takes priority over pristine GitHub content) before reasoning about or
// generating a change, so this is one implementation, not two that could
// silently drift apart.
async function resolveBaseContent(
  ctx: WriteOpsContext,
  filePath: string,
  isNewFile: boolean,
): Promise<{ content: string; baseSha: string } | { error: string }> {
  if (isNewFile) return { content: '', baseSha: 'new-file' }
  const working = await getWorkingFile(ctx.sessionId, filePath)
  if (working) return { content: working.content, baseSha: working.base_sha }
  const { content, sha, error } = await getFileContent(ctx.accessToken, ctx.owner, ctx.repo, filePath)
  if (error || content === null) return { error: error ?? 'not found' }
  return { content, baseSha: sha ?? contentHash(content) }
}

// ── propose_edit ──────────────────────────────────────────────────────────────
// Generates a diff. Writes NOTHING — not the repo, not the working-copy
// table. Only updates pending_diff on the session so `apply` has something
// to act on.
export async function proposeEdit(
  ctx: WriteOpsContext,
  filePath: string,
  instruction: string,
  isNewFile: boolean,
  priorReasoning?: string,
): Promise<WriteOpsResult> {
  const scopeError = await requireWriteScope(ctx)
  if (scopeError) return { output: scopeError, exitCode: 1 }

  const confined = confinePath(ctx.snapshotDir, filePath)
  if (confined === null) return { output: `path escapes repository: "${filePath}"`, exitCode: 1 }

  let baseContent = ''
  let baseSha = 'new-file'

  if (!isNewFile) {
    const resolved = await resolveBaseContent(ctx, filePath, false)
    if ('error' in resolved) return { output: `edit: could not read "${filePath}": ${resolved.error}`, exitCode: 1 }
    baseContent = resolved.content
    baseSha = resolved.baseSha
  } else {
    // `write` targeting a file that already exists is a misuse of the
    // command — existing files go through `edit`.
    const working = await getWorkingFile(ctx.sessionId, filePath)
    const { content: existing } = await getFileContent(ctx.accessToken, ctx.owner, ctx.repo, filePath)
    if (working || existing !== null) {
      return { output: `write: "${filePath}" already exists — use edit instead.`, exitCode: 1 }
    }
  }

  const effectiveInstruction = (ctx.resolvedInstruction ?? instruction).trim() || (isNewFile
    ? 'Create this file. Infer reasonable content from the file path and repository context.'
    : 'Review this file and propose your single best, most useful improvement — a real fix or a clear quality improvement, not a cosmetic no-op.')

  const generated = await generateFileContent(ctx, filePath, baseContent, effectiveInstruction, isNewFile, priorReasoning)
  if ('error' in generated) return { output: `${isNewFile ? 'write' : 'edit'}: generation failed — ${generated.error}`, exitCode: 1 }
  if (generated.truncated) {
    // Never propose a cut-off file as a ready-to-apply diff — that's a worse
    // failure than an explicit error, since it looks successful right up
    // until the truncated code fails to build. Nothing is saved to
    // pending_diff, so there's nothing stale for a later `apply` to pick up.
    const effortLabel = ctx.effort ?? 'none'
    return {
      output: `${isNewFile ? 'write' : 'edit'}: generation was cut off (ran out of output budget at "${effortLabel}" effort) before finishing "${filePath}" — no diff proposed. Try a higher effort level (more output budget), or narrow the instruction to a smaller, more specific change.`,
      exitCode: 1,
    }
  }

  const diff = generateDiff(filePath, baseContent, generated.content)
  const pending: PendingDiff = {
    file: filePath,
    diff,
    new_content: generated.content,
    is_new_file: isNewFile,
    base_sha: baseSha,
    proposed_at: new Date().toISOString(),
  }
  await saveSessionPayload(ctx.sessionId, ctx.userId, { pending_diff: pending })

  return { output: diff || '(no changes proposed)', exitCode: 0, reasoning: generated.reasoning }
}

// The model emits its plan first, then a sentinel line, then the raw file
// content. Splitting on a sentinel (rather than JSON) avoids escaping the
// file's own code — which routinely contains quotes, braces, and backslashes
// that would break JSON parsing.
const CONTENT_SENTINEL = '===FILE==='
const BASE_EDIT_SYSTEM_PROMPT = `You are enry's coding agent, proposing exactly one file's new full content.

You receive the target file's current content (empty for a new file) and an instruction. Respond in TWO parts, in this exact order:

1. A brief plan of what you're about to change. {{PLAN_DEPTH}}
2. A line containing exactly ${CONTENT_SENTINEL} and nothing else.
3. The complete new file content, raw — no markdown fences, no commentary, nothing after it.

If the instruction is not actually about changing this file's content, put a one-line explanation in the plan and output the original content unchanged after the sentinel.`

// ── .enryrules ───────────────────────────────────────────────
// When a repo has a .enryrules file at its root, its contents are injected
// into every coding-agent prompt. This lets the user encode repo-specific
// conventions ("always use const, never let", "Tailwind v4 CSS-first config",
// "no default exports") that the agent must follow.

let enryrulesCache: { repo: string; content: string; ts: number } | null = null
const ENRYRULES_CACHE_TTL = 300_000 // 5 min in-memory cache per serverless instance

// The single implementation of the .enryrules fetch — every prompt-building
// path (propose/plan edits, skill and multi-skill responses, the sidebar's
// hasEnryRules flag) calls this instead of its own inline getFileContent, so
// there's one cache and one place that logs a real failure instead of four
// call sites each silently treating a transient GitHub error as "no rules."
export async function loadEnryRules(ctx: WriteOpsContext): Promise<string | null> {
  const key = `${ctx.owner}/${ctx.repo}`
  if (enryrulesCache && enryrulesCache.repo === key && Date.now() - enryrulesCache.ts < ENRYRULES_CACHE_TTL) {
    return enryrulesCache.content || null
  }
  try {
    const { content, error } = await getFileContent(ctx.accessToken, ctx.owner, ctx.repo, '.enryrules')
    // A 404 genuinely means "no .enryrules file" — cache that as empty, same
    // as before. Any OTHER error (rate limit, 5xx, network) is not the same
    // fact and must not be cached as "no rules" for the next 5 minutes — log
    // it and return null uncached so the next call gets a fresh attempt.
    if (error && !error.includes('404')) {
      console.error('[terminal/write-ops] loadEnryRules fetch failed (not caching as absent):', error)
      return null
    }
    if (error || !content) {
      enryrulesCache = { repo: key, content: '', ts: Date.now() }
      return null
    }
    enryrulesCache = { repo: key, content, ts: Date.now() }
    return content
  } catch (err) {
    console.error('[terminal/write-ops] loadEnryRules threw:', err)
    return null
  }
}

export function buildEnryRulesBlock(content: string): string {
  return `\n\nREPOSITORY RULES (.enryrules) — these are non-negotiable conventions for this repo. Follow them exactly:\n${content}`
}

export async function generateFileContent(
  ctx: WriteOpsContext,
  filePath: string,
  baseContent: string,
  instruction: string,
  isNewFile: boolean,
  priorReasoning?: string,
): Promise<{ reasoning: string; content: string; truncated: boolean } | { error: string }> {
  const effort = EFFORT_PARAMS[ctx.effort ?? 'none']
  const rules = await loadEnryRules(ctx)
  const system = BASE_EDIT_SYSTEM_PROMPT.replace('{{PLAN_DEPTH}}', effort.planDepth) + (rules ? buildEnryRulesBlock(rules) : '')
  // priorReasoning, when present, comes from a SEPARATE generateReasoningTrace
  // call (its own invocation, its own <think>-enabled generateText call) —
  // never from this one. It's folded in here as plain prompt CONTEXT, not a
  // system-prompt change, and this call never sets reasoningExtraBody itself.
  // That separation is the whole point: BASE_EDIT_SYSTEM_PROMPT's
  // plan-then-CONTENT_SENTINEL-then-file-content contract stays exactly as
  // it was, so a <think> block can never land inside the sentinel-split
  // response and corrupt the diff — the risk flagged when this was first
  // scoped, and the reason it wasn't wired in directly back then.
  const reasoningContext = priorReasoning
    ? `\n\nYou already thought through this change in a prior reasoning pass — treat it as your own analysis, already done:\n${priorReasoning}\n\nNow execute on it.`
    : ''
  try {
    const client = nimClientFor(ctx.model)
    const { text, finishReason } = await generateText({
      model: client.chat(ctx.model ?? DEFAULT_NIM_MODEL),
      system,
      prompt: `File: ${filePath}\n${isNewFile ? '(new file — no existing content)' : `Current content:\n${baseContent}`}\n\nInstruction: ${instruction}${reasoningContext}\n\nProduce your plan, then ${CONTENT_SENTINEL}, then the complete new file content.`,
      temperature: effort.temperature,
      maxOutputTokens: effort.maxOutputTokens,
      // 40s, NOT 50s — this call does not own the full 60s maxDuration alone.
      // The same invocation first runs ensureSnapshot (up to a full repo
      // tarball re-download on a cold Vercel instance) + 4-5 GitHub API calls
      // (resolveHead x2, checkWriteScope, getFileContent) before reaching
      // here, which can eat 10-20s. At the old 50s, a large-file generation
      // that legitimately ran ~48s tipped the total past 60s and Vercel
      // returned an opaque 504 BEFORE this AbortController could fire and let
      // the route surface its own clean error. 40s guarantees the abort wins
      // the race, converting the 504 into an actionable "timed out" message.
      // maxRetries: 0 so a retry can't silently double wall-clock past 60s.
      timeout: 40_000,
      maxRetries: 0,
    })

    // finishReason 'length' means the model hit maxOutputTokens mid-generation
    // — for a large file + detailed instruction this is a real, observed
    // failure mode (confirmed against a real ~43KB file: a 500-word
    // instruction alone consumed the full 4096-token 'none'-effort budget).
    // The caller must not silently propose a cut-off file as a complete diff.
    const truncated = finishReason === 'length'

    // Split plan from content on the sentinel. If the model omitted it, treat
    // the whole response as content with no reasoning (degrades gracefully).
    const idx = text.indexOf(CONTENT_SENTINEL)
    if (idx === -1) {
      return { reasoning: '', content: stripFences(text), truncated }
    }
    const reasoning = text.slice(0, idx).trim()
    const content = stripFences(text.slice(idx + CONTENT_SENTINEL.length).replace(/^\n/, ''))
    return { reasoning, content, truncated }
  } catch (err) {
    console.error('[terminal/write-ops] generateFileContent threw:', err)
    // Distinguish a timeout abort from a genuine upstream error — they call
    // for different user actions. A timeout on a large file/high effort means
    // "the model couldn't finish inside the budget"; surface that as an
    // actionable message rather than a raw "Aborted"/TimeoutError string.
    const name = err instanceof Error ? err.name : ''
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = name === 'TimeoutError' || name === 'AbortError' || /abort|timed?\s?out/i.test(msg)
    if (isTimeout) {
      return { error: `generation timed out before finishing this file — it's too large or the request too broad to complete in one pass. Try a lower effort level, or narrow the change to a smaller, more specific edit.` }
    }
    return { error: msg }
  }
}

// ── Reasoning pre-step (Think, for plain code edits) ─────────────────────────
// A genuinely SEPARATE generateText call from generateFileContent — its own
// system prompt, its own output contract (pure prose, no CONTENT_SENTINEL, no
// file content at all), and it's the ONLY one of the two calls that ever sets
// reasoningExtraBody (enable_thinking). The two never share a call, so a
// <think> block this produces can never land inside generateFileContent's
// sentinel-split output — the corruption risk that was the reason this wasn't
// wired in the first time. Only the resulting TEXT crosses over, folded into
// generateFileContent's prompt as inert context (see reasoningContext above).
const REASONING_SYSTEM_PROMPT = `You are enry's coding agent, thinking through a change BEFORE writing any code.

Given a file's current content and an instruction, reason through it out loud: what actually needs to change and why, what the cleanest complete approach looks like, what could go wrong, and any edge cases or repo conventions that matter here. This is preparation for a second pass that will write the actual diff — your job here is ONLY to think, not to write code or propose file content.

Keep it focused and concrete — real reasoning about this specific file and instruction, not generic commentary. A few short paragraphs, not an essay.`

export async function generateReasoningTrace(
  ctx: WriteOpsContext,
  filePath: string,
  instruction: string,
  isNewFile: boolean,
): Promise<{ trace: string } | { error: string }> {
  const resolved = await resolveBaseContent(ctx, filePath, isNewFile)
  if ('error' in resolved) return { error: `could not read "${filePath}": ${resolved.error}` }

  const rules = await loadEnryRules(ctx)
  const system = REASONING_SYSTEM_PROMPT + (rules ? buildEnryRulesBlock(rules) : '')

  try {
    const client = nimClientFor(ctx.model)
    const { text } = await generateText({
      model: client.chat(ctx.model ?? DEFAULT_NIM_MODEL),
      system,
      prompt: `File: ${filePath}\n${isNewFile ? '(new file — no existing content)' : `Current content:\n${resolved.content}`}\n\nInstruction: ${instruction}\n\nThink through this now.`,
      temperature: 0.4,
      maxOutputTokens: 1500,
      // Same scale as the classify hop (nl-edit.ts) — this is bounded prose,
      // not a full file rewrite, so it doesn't need generateFileContent's 40s.
      // This call runs on the generation hop (isGenerationHop already skips
      // ensureSnapshot for it), so its own overhead ahead of this is just
      // requireWriteScope + resolveBaseContent, both GitHub API calls that
      // now carry their own 10s timeout — comfortable margin under 60s even
      // worst-case, and the client's own follow-up generation hop is a fresh
      // invocation with its own untouched 40s budget.
      timeout: 25_000,
      maxRetries: 0,
      ...(reasoningExtraBody(ctx.model ?? DEFAULT_NIM_MODEL) ?? {}),
    })
    const { answer } = parseReasoningTrace(text)
    const trimmed = answer.trim()
    if (!trimmed) return { error: 'model returned an empty reasoning trace' }
    return { trace: trimmed }
  } catch (err) {
    console.error('[terminal/write-ops] generateReasoningTrace threw:', err)
    const name = err instanceof Error ? err.name : ''
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = name === 'TimeoutError' || name === 'AbortError' || /abort|timed?\s?out/i.test(msg)
    return { error: isTimeout ? 'reasoning pass timed out — proceeding straight to the diff without it.' : msg }
  }
}

function stripFences(text: string): string {
  return text
    .replace(/^```[a-zA-Z0-9]*\n/, '')
    .replace(/\n```\s*$/, '')
}

// ── apply ─────────────────────────────────────────────────────────────────────
export async function applyEdit(ctx: WriteOpsContext): Promise<WriteOpsResult> {
  const scopeError = await requireWriteScope(ctx)
  if (scopeError) return { output: scopeError, exitCode: 1 }

  const payload = await loadSessionPayload(ctx.sessionId, ctx.userId)
  const pending = payload?.pending_diff
  if (!pending) return { output: 'apply: nothing pending. Run edit/write first.', exitCode: 1 }

  if (pending.is_new_file) {
    const working = await getWorkingFile(ctx.sessionId, pending.file)
    const { content: existing } = await getFileContent(ctx.accessToken, ctx.owner, ctx.repo, pending.file)
    if (working || existing !== null) {
      await saveSessionPayload(ctx.sessionId, ctx.userId, { pending_diff: null })
      return { output: `apply: "${pending.file}" now exists — this was a new-file proposal, use edit for existing files. Pending change cleared; re-run edit.`, exitCode: 1 }
    }
  } else {
    // Stale-diff check: re-derive what "current" means for this file right
    // now and compare against what the diff was proposed against. A working-
    // copy row's base_sha is always contentHash(its own content) — set that
    // way by every upsert below — so it's a direct fingerprint comparison,
    // not a lookup of what it was originally based on.
    const working = await getWorkingFile(ctx.sessionId, pending.file)
    let currentSha: string | null
    if (working) {
      currentSha = working.base_sha
    } else {
      const { sha, error } = await getFileContent(ctx.accessToken, ctx.owner, ctx.repo, pending.file)
      if (error) return { output: `apply: could not verify "${pending.file}" is still current: ${error}`, exitCode: 1 }
      currentSha = sha
    }
    if (currentSha !== pending.base_sha) {
      await saveSessionPayload(ctx.sessionId, ctx.userId, { pending_diff: null })
      return { output: `apply: "${pending.file}" changed since this diff was proposed — stale. Re-run edit to see the latest version.`, exitCode: 1 }
    }
  }

  const newBaseSha = contentHash(pending.new_content)
  const { ok, error } = await upsertWorkingFile(ctx.userId, ctx.sessionId, pending.file, pending.new_content, newBaseSha, pending.is_new_file)
  if (!ok) return { output: `apply: failed to save — ${error}`, exitCode: 1 }

  // Materialize immediately so a `cat` right after `apply` shows the change.
  // resolveExecutionDir already writes every working file (including the one
  // just upserted above) onto the returned dir — no separate write needed
  // here. Called with pristineSnapshotDir, not ctx.snapshotDir: the working
  // file this upsert just created didn't exist yet when the route resolved
  // ctx.snapshotDir, so on a first-ever apply that value is still the
  // pristine shared cache — writing there would leak into any other session
  // reading the same repo+headSha.
  await resolveExecutionDir(ctx.sessionId, ctx.pristineSnapshotDir)

  // Auto-create a working branch when this session doesn't have one yet.
  // Previously apply always left current_branch unset until the user
  // manually ran `branch "<name>"` — Commit/Create PR would then render as
  // clickable, but both guard on current_branch and bounce with "no working
  // branch set", a dead end after every applied change unless you already
  // knew to type that command first. This is the same pattern Cruise already
  // uses (dispatch-scanfix.ts auto-generates `enry-cruise/goal-<id>` with no
  // user interaction) — Drive's quick-action buttons (Apply/Commit/Create PR)
  // are built for zero manual typing too, so auto-create fits the existing
  // UX better than adding a new inline-prompt pattern nothing else here uses.
  if (!payload?.current_branch) {
    const branchName = autoBranchName(pending.file)
    const { error: branchError } = await createOrSwitchBranch(ctx.accessToken, ctx.owner, ctx.repo, branchName, ctx.defaultBranch)
    if (branchError) {
      // The working copy already saved successfully — don't fail the apply
      // over the auto-branch step. Degrade to the old manual-branch path.
      console.error('[terminal/write-ops] applyEdit auto-branch failed:', branchError)
      await saveSessionPayload(ctx.sessionId, ctx.userId, { pending_diff: null })
      return {
        output: `applied: ${pending.file} (working copy — not committed yet). Couldn't auto-create a branch (${branchError}) — run branch "<name>" manually before commit/pr.`,
        exitCode: 0,
      }
    }
    await saveSessionPayload(ctx.sessionId, ctx.userId, { pending_diff: null, current_branch: branchName })
    return {
      output: `applied: ${pending.file} (working copy) — created and switched to branch "${branchName}". Run commit "<message>" when ready.`,
      exitCode: 0,
    }
  }

  await saveSessionPayload(ctx.sessionId, ctx.userId, { pending_diff: null })
  return { output: `applied: ${pending.file} (working copy — not committed yet; run commit "<message>" when ready)`, exitCode: 0 }
}

// Deterministic-enough, collision-resistant branch name for an auto-created
// working branch: enry/edit-<slugified file basename>-<short random suffix>.
// Only ever called when the session has no current_branch yet — once one
// exists, every subsequent apply in that session reuses it (same as the
// manual `branch "<name>"` flow always has).
function autoBranchName(filePath: string): string {
  const base = (filePath.split('/').pop() ?? filePath).replace(/\.[^./]+$/, '')
  // Split camelCase/PascalCase boundaries before lowercasing, so
  // "DeepAnalysis" reads as "deep-analysis" rather than "deepanalysis".
  const withWordBreaks = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  const slug = withWordBreaks.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'change'
  const suffix = Math.random().toString(36).slice(2, 7)
  return `enry/edit-${slug}-${suffix}`
}

// ── discard ───────────────────────────────────────────────────────────────────
// Clears the pending diff without writing it. The pending diff lives in the
// session row server-side, so a client-only discard would leave it appliable
// by the next `apply` — this makes the discard authoritative.
export async function discardEdit(ctx: WriteOpsContext): Promise<WriteOpsResult> {
  const payload = await loadSessionPayload(ctx.sessionId, ctx.userId)
  if (!payload?.pending_diff) return { output: 'discard: nothing pending.', exitCode: 0 }
  await saveSessionPayload(ctx.sessionId, ctx.userId, { pending_diff: null })
  return { output: `discarded proposed change to ${payload.pending_diff.file}`, exitCode: 0 }
}

// ── plan (manual-mode phase 1) ───────────────────────────────────────────────
// Generates a reasoning plan for the change without producing a diff. The client
// shows this plan to the user, who can then refine their instruction or click
// Proceed to trigger the actual proposeEdit call.
export async function planEdit(
  ctx: WriteOpsContext,
  filePath: string,
  instruction: string,
  isNewFile: boolean,
): Promise<WriteOpsResult> {
  const scopeError = await requireWriteScope(ctx)
  if (scopeError) return { output: scopeError, exitCode: 1 }

  const confined = confinePath(ctx.snapshotDir, filePath)
  if (confined === null) return { output: `path escapes repository: "${filePath}"`, exitCode: 1 }

  let baseContent = ''
  if (!isNewFile) {
    const working = await getWorkingFile(ctx.sessionId, filePath)
    if (working) {
      baseContent = working.content
    } else {
      const { content, error } = await getFileContent(ctx.accessToken, ctx.owner, ctx.repo, filePath)
      if (error || content === null) return { output: `plan: could not read "${filePath}": ${error ?? 'not found'}`, exitCode: 1 }
      baseContent = content
    }
  }

  const effort = EFFORT_PARAMS[ctx.effort ?? 'none']
  const rules = await loadEnryRules(ctx)
  const PLAN_SYSTEM = `You are enry's coding agent, producing a plan BEFORE writing code.

Given a file and an instruction, produce a clear, structured plan for what you will change.
${effort.planDepth}

Do NOT produce the actual file content — only the plan. Be specific about line ranges,
function names, and structural changes if applicable. If the instruction is
ambiguous, ask one or two clarifying questions at the end of your plan.

If the instruction is not about changing code, say so in one sentence and refuse.

Keep the plan under ${Math.round(effort.maxOutputTokens / 2)} words.${rules ? buildEnryRulesBlock(rules) : ''}`

  try {
    const client = nimClientFor(ctx.model)
    const { text } = await generateText({
      model: client.chat(ctx.model ?? DEFAULT_NIM_MODEL),
      system: PLAN_SYSTEM,
      prompt: `File: ${filePath}\n${isNewFile ? '(new file)' : `Current content (first 2000 chars):\n${baseContent.slice(0, 2000)}`}\n\nInstruction: ${instruction}\n\nProduce your plan.`,
      temperature: effort.temperature,
      maxOutputTokens: Math.round(effort.maxOutputTokens / 2),
      timeout: 30_000,
      // Was maxRetries: 1 — the last retry-doubling leftover in this file. A
      // retried 30s timeout is up to 60s of LLM alone, which plus the same
      // snapshot + GitHub overhead as the generation path blows past the 60s
      // maxDuration into a 504. 0 = fail once, cleanly.
      maxRetries: 0,
    })
    return { output: `Plan for ${filePath}`, exitCode: 0, reasoning: text.trim() }
  } catch (err) {
    console.error('[terminal/write-ops] planEdit threw:', err)
    return { output: `plan: generation failed — ${err instanceof Error ? err.message : String(err)}`, exitCode: 1 }
  }
}

// ── branch ────────────────────────────────────────────────────────────────────
export async function createBranch(ctx: WriteOpsContext, name: string): Promise<WriteOpsResult> {
  const scopeError = await requireWriteScope(ctx)
  if (scopeError) return { output: scopeError, exitCode: 1 }

  if (isDefaultBranch(ctx, name)) {
    return { output: `branch: can't use "${name}" as a working branch — that's the default branch. Changes never go directly to it. Pick a different name.`, exitCode: 1 }
  }

  const { created, error } = await createOrSwitchBranch(ctx.accessToken, ctx.owner, ctx.repo, name, ctx.defaultBranch)
  if (error) return { output: `branch: ${error}`, exitCode: 1 }

  await saveSessionPayload(ctx.sessionId, ctx.userId, { current_branch: name })
  return { output: created ? `created and switched to branch "${name}"` : `switched to existing branch "${name}"`, exitCode: 0 }
}

// ── commit ────────────────────────────────────────────────────────────────────
export async function commitChanges(ctx: WriteOpsContext, message: string): Promise<WriteOpsResult> {
  const scopeError = await requireWriteScope(ctx)
  if (scopeError) return { output: scopeError, exitCode: 1 }

  const payload = await loadSessionPayload(ctx.sessionId, ctx.userId)
  const branch = payload?.current_branch
  if (!branch) return { output: 'commit: no working branch set. Run branch "<name>" first.', exitCode: 1 }
  if (isDefaultBranch(ctx, branch)) {
    return { output: `commit: refusing to commit to "${branch}" — that's the default branch.`, exitCode: 1 }
  }

  const files = await listWorkingFiles(ctx.sessionId)
  if (files.length === 0) return { output: 'commit: nothing to commit. Run edit/write then apply first.', exitCode: 1 }

  const { commitSha, error } = await commitFiles(
    ctx.accessToken,
    ctx.owner,
    ctx.repo,
    branch,
    message,
    files.map((f) => ({ path: f.file_path, content: f.content, isNew: f.is_new_file })),
  )
  if (error || !commitSha) return { output: `commit: ${error ?? 'failed'}`, exitCode: 1 }

  await clearWorkingFiles(ctx.sessionId, files.map((f) => f.file_path))
  return {
    output: `[${branch} ${commitSha.slice(0, 7)}] ${message}\n ${files.length} file${files.length === 1 ? '' : 's'} changed`,
    exitCode: 0,
  }
}

// ── pr ────────────────────────────────────────────────────────────────────────
export async function openPullRequest(ctx: WriteOpsContext, title: string, description: string): Promise<WriteOpsResult> {
  const scopeError = await requireWriteScope(ctx)
  if (scopeError) return { output: scopeError, exitCode: 1 }

  const payload = await loadSessionPayload(ctx.sessionId, ctx.userId)
  const branch = payload?.current_branch
  if (!branch) return { output: 'pr: no working branch set. Run branch "<name>" first.', exitCode: 1 }
  if (isDefaultBranch(ctx, branch)) {
    return { output: `pr: "${branch}" is the default branch — nothing to open a PR from.`, exitCode: 1 }
  }

  const { pr, error } = await ghCreatePullRequest(ctx.accessToken, ctx.owner, ctx.repo, title, description, branch, ctx.defaultBranch)
  if (error || !pr) return { output: `pr: ${error ?? 'failed'}`, exitCode: 1 }

  return { output: `opened PR #${pr.number}: ${pr.title}\n${pr.html_url}`, exitCode: 0 }
}
