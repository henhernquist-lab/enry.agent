import { supabase } from '../supabase'
import { getFileContent, checkWriteScope, createOrSwitchBranch, commitFiles, createPullRequest as ghCreatePullRequest } from '../github'
import { nimClientFor, DEFAULT_NIM_MODEL } from '../nim'
import { generateText } from 'ai'
import { generateDiff, contentHash } from './diff'
import { confinePath } from './snapshot'
import { getWorkingFile, upsertWorkingFile, listWorkingFiles, clearWorkingFiles, resolveExecutionDir } from './working-copy'
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
}

export interface WriteOpsResult {
  output: string
  exitCode: number
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

async function saveSessionPayload(sessionId: string, userId: string, patch: Partial<TerminalSessionPayload>): Promise<void> {
  const current = await loadSessionPayload(sessionId, userId)
  if (!current) return
  await supabase
    .from('resources')
    .update({ payload: { ...current, ...patch }, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId)
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

// ── propose_edit ──────────────────────────────────────────────────────────────
// Generates a diff. Writes NOTHING — not the repo, not the working-copy
// table. Only updates pending_diff on the session so `apply` has something
// to act on.
export async function proposeEdit(
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
  let baseSha = 'new-file'

  if (!isNewFile) {
    // Prefer an already-applied-but-uncommitted version of this file
    // (stacked edit) over the pristine GitHub content.
    const working = await getWorkingFile(ctx.sessionId, filePath)
    if (working) {
      baseContent = working.content
      baseSha = working.base_sha
    } else {
      const { content, sha, error } = await getFileContent(ctx.accessToken, ctx.owner, ctx.repo, filePath)
      if (error || content === null) return { output: `edit: could not read "${filePath}": ${error ?? 'not found'}`, exitCode: 1 }
      baseContent = content
      baseSha = sha ?? contentHash(content)
    }
  } else {
    // `write` targeting a file that already exists is a misuse of the
    // command — existing files go through `edit`.
    const working = await getWorkingFile(ctx.sessionId, filePath)
    const { content: existing } = await getFileContent(ctx.accessToken, ctx.owner, ctx.repo, filePath)
    if (working || existing !== null) {
      return { output: `write: "${filePath}" already exists — use edit instead.`, exitCode: 1 }
    }
  }

  const effectiveInstruction = instruction.trim() || (isNewFile
    ? 'Create this file. Infer reasonable content from the file path and repository context.'
    : 'Review this file and propose your single best, most useful improvement — a real fix or a clear quality improvement, not a cosmetic no-op.')

  const newContent = await generateFileContent(ctx, filePath, baseContent, effectiveInstruction, isNewFile)
  if (newContent === null) return { output: `${isNewFile ? 'write' : 'edit'}: generation failed`, exitCode: 1 }

  const diff = generateDiff(filePath, baseContent, newContent)
  const pending: PendingDiff = {
    file: filePath,
    diff,
    new_content: newContent,
    is_new_file: isNewFile,
    base_sha: baseSha,
    proposed_at: new Date().toISOString(),
  }
  await saveSessionPayload(ctx.sessionId, ctx.userId, { pending_diff: pending })

  return { output: diff || '(no changes proposed)', exitCode: 0 }
}

const EDIT_SYSTEM_PROMPT = `You propose exactly one file's new full content for enry.agent's Live Terminal coding mode. You receive the target file's current content (empty for a new file) and an instruction. Output ONLY the complete new file content — no markdown fences, no explanation, no commentary before or after. If the instruction is not actually about code/file content, output the original content unchanged.`

async function generateFileContent(
  ctx: WriteOpsContext,
  filePath: string,
  baseContent: string,
  instruction: string,
  isNewFile: boolean,
): Promise<string | null> {
  try {
    const client = nimClientFor()
    const { text } = await generateText({
      model: client.chat(DEFAULT_NIM_MODEL),
      system: EDIT_SYSTEM_PROMPT,
      prompt: `File: ${filePath}\n${isNewFile ? '(new file — no existing content)' : `Current content:\n${baseContent}`}\n\nInstruction: ${instruction}\n\nOutput the complete new file content now.`,
      temperature: 0.3,
      maxOutputTokens: 4096,
      timeout: 45_000,
      maxRetries: 1,
    })
    return stripFences(text)
  } catch (err) {
    console.error('[terminal/write-ops] generateFileContent threw:', err)
    return null
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

  await saveSessionPayload(ctx.sessionId, ctx.userId, { pending_diff: null })
  return { output: `applied: ${pending.file} (working copy — not committed yet; run commit "<message>" when ready)`, exitCode: 0 }
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
