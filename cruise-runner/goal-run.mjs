// Enry Cruise — goal-directed autonomous mode runner.
//
// Committed into an allowlisted repo as `.enry-cruise/goal-run.mjs`. Given a
// natural-language goal, plans a bounded set of steps, edits files locally in
// the checkout, validates each edit with the repo's own tsc/eslint before
// accepting it, and posts accepted changes to enry.agent's
// /api/cruise/goal-runs/{id}/apply — which is what actually commits (this
// runner never gets push access; permissions stay contents:read, see
// enry-cruise-goal.yml). All LLM calls go through the metered
// /api/cruise/llm proxy, which is the authoritative spend cap — this script's
// own step counting is a courtesy, not the enforcement.
//
// A clarifying question during planning ends this process (exit 0, not a
// failure); the app re-dispatches a fresh run once the user answers, and this
// script's first move on every dispatch is fetching /context to resume
// exactly where the last dispatch left off.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, normalize, isAbsolute } from 'node:path'
import { execSync } from 'node:child_process'
import { blockingFindings, CATEGORY_FIXERS } from './lib/analyzers.mjs'

// Editor system prompts. GOAL builds features (may create files, append chunks);
// FIX resolves already-flagged findings with the minimal change and removes dead
// code. Selected per run by ctx.mode.
const GOAL_EDITOR_SYSTEM = `You are editing files in a checked-out git repo to accomplish one step of a larger goal.

Do NOT use JSON — file contents break JSON escaping. Use these exact marker formats.

To create a new file or fully rewrite one (content = the WHOLE file):
===FILE: <repo-relative path>===
<the COMPLETE new file content, verbatim — no diff, no snippet, no fencing>
===ENDFILE===

To ADD a chunk to the END of a file that already exists (content = ONLY the new lines):
===APPEND: <repo-relative path>===
<only the new content to append — not the whole file>
===ENDAPPEND===

After all blocks, emit one line:
===NOTE: <one-line summary of what you changed>===

If the step needs no file changes (already satisfied), output exactly one line and nothing else:
===NO CHANGES===

Rules:
- Output only blocks + the NOTE line (or NO CHANGES). No prose, no markdown fences.
- If the step says to ADD / APPEND a chunk to an existing file, use ===APPEND:=== and emit ONLY that chunk — never regenerate the whole file. This keeps your output small. Use ===FILE:=== only to create a new file or when a full rewrite is genuinely required. Appended CSS blocks (a second :root {}, .dark {}, or @layer base {}) are valid and merge in the cascade.
- Match the repo's existing conventions, imports, and framework idioms — read the provided existing files first.
- Import ONLY from paths that appear in REPO FILES or FILES CHANGED THIS RUN below, or from installed packages. Never invent a module path — if you need a helper that doesn't exist yet, define it inline or create the file in this same response.
- Include every import your code uses (e.g. React hooks like useState/useEffect). Do not reference an identifier you didn't import or define.`

const FIX_EDITOR_SYSTEM = `You are fixing specific, ALREADY-FLAGGED issues in ONE existing file of a checked-out git repo. The CURRENT STEP lists the exact findings to resolve in that file.

Make the MINIMAL change that resolves each listed finding. Do NOT add features, refactor unrelated code, rename symbols, reformat, or change behavior beyond what a fix requires.
- Dead code (unused import, unused variable, unreachable code): DELETE it.
- Type / lint error: apply the smallest correct fix.
- If a listed finding is a false positive or can't be fixed safely without broader changes, leave that part as-is (the run will just re-flag it next scan).

Output the corrected file with this exact format — no JSON, no markdown fences:
===FILE: <repo-relative path>===
<the COMPLETE corrected file content, verbatim>
===ENDFILE===
===NOTE: <one-line summary of what you fixed>===

If nothing needs to change, output exactly one line: ===NO CHANGES===

Rules: output only the FILE block + NOTE (or NO CHANGES). Never introduce an import from a module that doesn't exist. Keep every import that's still used; remove only the ones the fix makes unused. Do not reference an identifier you didn't import or define.`

const GOAL_RUN_ID = process.env.ENRY_GOAL_RUN_ID
const CALLBACK = (process.env.ENRY_CALLBACK || '').replace(/\/+$/, '')
const TOKEN = process.env.ENRY_TOKEN
const REPO = process.env.ENRY_REPO || ''
const CAP_FILES = Number(process.env.ENRY_CAP_FILES) || 10
const CAP_STEPS = Number(process.env.ENRY_CAP_STEPS) || 40
const MAX_PLAN_STEPS = 20
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.enry-cruise', '.github'])

if (!GOAL_RUN_ID || !CALLBACK || !TOKEN) {
  console.error('[enry-cruise-goal] missing ENRY_GOAL_RUN_ID / ENRY_CALLBACK / ENRY_TOKEN')
  process.exit(1)
}

async function api(method, path, body, { timeoutMs = 45000 } = {}) {
  // Hard timeout on every call — a hung connection (a Vercel function that
  // never returns a response, a stuck GitHub commit) must NOT hang the whole
  // run. On abort the call fails like any other transport error, the step fails
  // gracefully, and the loop continues to finalize. Default 45s covers the fast
  // DB/GitHub callbacks; the LLM call passes a longer budget (see llm()).
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(CALLBACK + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    // A Vercel function timeout (e.g. the 504 on a slow completion) returns an
    // HTML body, not JSON — catch that so it surfaces as a transport failure
    // rather than an empty {} the caller misreads as "model returned nothing".
    const json = await res.json().catch(() => ({ error: `non-JSON response (HTTP ${res.status})` }))
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    const aborted = e && e.name === 'AbortError'
    return { ok: false, status: 0, json: { error: aborted ? `request timed out after ${timeoutMs}ms` : 'network: ' + (e && e.message || e) } }
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Calls the metered LLM proxy with retry/backoff. Returns exactly one of:
//   { text }            — a usable, non-empty completion
//   { budgetExceeded }  — the run's LLM budget is spent (terminal, never retried)
//   { failed, ... }     — proxy error / timeout / empty text, after retries
// This is what stops a proxy/API failure or a Vercel timeout from being
// misreported as "the model returned nothing" — those are transport failures,
// and transient ones usually clear on a retry.
async function llm(messages, { retries = 2 } = {}) {
  let last = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Generation can legitimately run long (up to the proxy's maxDuration);
    // give it well over that so a real slow completion isn't aborted, while a
    // truly hung connection still eventually fails instead of stalling forever.
    const { ok, status, json } = await api('POST', '/api/cruise/llm', { goal_run_id: GOAL_RUN_ID, messages }, { timeoutMs: 310000 })
    if (json && json.error === 'budget_exceeded') return { budgetExceeded: true }
    if (ok && json && typeof json.text === 'string' && json.text.trim()) {
      return { text: json.text, finishReason: json.finish_reason ?? null }
    }
    last = {
      status,
      error: (json && json.error) || null,
      finishReason: (json && json.finish_reason) || null,
      empty: !!(ok && json && typeof json.text === 'string' && !json.text.trim()),
    }
    if (attempt < retries) await sleep(1500 * (attempt + 1))
  }
  return { failed: true, ...last }
}

// Human-readable reason for a failed llm() call — so a step detail says WHY
// (HTTP status, proxy error text, or empty-with-finish-reason) instead of the
// old catch-all "(empty response)".
function describeLlmFailure(r) {
  if (r.empty) return `model returned empty text${r.finishReason ? ` (finish reason: ${r.finishReason})` : ''}`
  if (r.error) return `${r.error}${r.status ? ` (HTTP ${r.status})` : ''}`
  if (r.status) return `HTTP ${r.status}`
  return 'unknown error'
}

// Planner responses are short JSON (plan strings / a clarify question) — safe
// to JSON-parse. Editor responses carry full file bodies and use parseEdits
// instead (JSON-escaping code is what made editor output fail).
function extractJson(text) {
  const stripped = String(text || '').replace(/```json\s*|```/g, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try { return JSON.parse(stripped.slice(start, end + 1)) } catch { return null }
}

// Parse the marker-delimited editor response into { files, note, noChanges }.
// No JSON escaping of file bodies — content is verbatim between markers. Two
// block kinds: FILE (create / full-replace, content = whole file) and APPEND
// (content = only the chunk to add to the end of an existing file). APPEND lets
// a large file be built across several small steps whose per-call OUTPUT stays
// well under the LLM proxy timeout. matchedAny is false only when the model
// produced no block and no NO-CHANGES sentinel — a genuinely malformed response.
function parseEdits(text) {
  const raw = String(text || '')
  const files = []
  const fileRe = /===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)\r?\n===ENDFILE===/g
  const appendRe = /===APPEND:\s*(.+?)\s*===\r?\n([\s\S]*?)\r?\n===ENDAPPEND===/g
  let m
  while ((m = fileRe.exec(raw)) !== null) { if (m[1].trim()) files.push({ path: m[1].trim(), content: m[2], mode: 'replace' }) }
  while ((m = appendRe.exec(raw)) !== null) { if (m[1].trim()) files.push({ path: m[1].trim(), content: m[2], mode: 'append' }) }
  const noChanges = /===\s*NO CHANGES\s*===/.test(raw)
  const noteM = raw.match(/===NOTE:\s*([\s\S]*?)===/)
  const note = noteM ? noteM[1].trim().slice(0, 200) : ''
  return { files, note, noChanges, matchedAny: files.length > 0 || noChanges }
}

// Capped list of the repo's real file paths (dirs marked with a trailing /).
// The editor uses this so it imports from modules that ACTUALLY EXIST instead
// of inventing paths — the model can't otherwise see the repo's structure.
function listFiles() {
  const lines = []
  let total = 0
  const MAX_LINES = 400
  const MAX_CHARS = 20_000
  function walk(dir, depth) {
    if (lines.length >= MAX_LINES || depth > 4) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (lines.length >= MAX_LINES) return
      if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue
      const p = dir === '.' ? e.name : dir + '/' + e.name
      if (e.isDirectory()) { lines.push(p + '/'); total += p.length; walk(p, depth + 1) }
      else { lines.push(p); total += p.length }
      if (total > MAX_CHARS) return
    }
  }
  walk('.', 0)
  return lines
}

// Small repo context for the planner: the file tree + a couple of well-known
// manifest files, not a full checkout dump.
function repoOverview() {
  let manifest = ''
  for (const f of ['package.json', 'tsconfig.json']) {
    if (existsSync(f)) manifest += `\n\n--- ${f} ---\n` + readFileSync(f, 'utf8').slice(0, 3000)
  }
  return listFiles().join('\n') + manifest
}

// Pull plausible file paths out of free text (a plan step, an LLM note) so we
// can hand the editor call the CURRENT content of files it's about to touch.
function extractPaths(text) {
  const re = /\b([\w.-]+(?:\/[\w.-]+)+\.\w+)\b/g
  const found = new Set()
  let m
  while ((m = re.exec(String(text || ''))) !== null) found.add(m[1])
  return [...found].slice(0, 8)
}

function readIfExists(path) {
  try {
    if (!existsSync(path) || statSync(path).isDirectory()) return null
    return readFileSync(path, 'utf8')
  } catch { return null }
}

async function postStep(seq, status, detail) {
  await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'step', seq, status, detail })
}

// ── Heartbeat + control signals (matches scan.mjs pattern) ───────────────────

async function stepUpdate(action, { file = null, command = null, output_preview = null } = {}) {
  // Send a step update to the LIVE-STEPS endpoint (visible workspace), NOT the
  // goal-runs ingest — the live-steps endpoint stores these for LiveWorkspace
  // polling, and the goal-run ingest handles the step state separately.
  return api('POST', '/api/cruise/ingest', {
    scan_id: GOAL_RUN_ID,
    phase: 'step_update',
    action,
    file,
    command,
    output_preview,
  })
}

// Check for pause/cancel signals from the UI. Called between major phases.
// Returns 'proceed' if clear, 'paused' if signal was pause (waited for clear),
// or exits the process if cancel.
async function checkControlSignal() {
  const resp = await api('POST', '/api/cruise/goal-runs/' + GOAL_RUN_ID + '/ingest', { phase: 'heartbeat' })
  const signal = resp.json?.control_signal
  if (signal === 'cancel') {
    console.log('[enry-cruise-goal] cancel signal received, exiting cleanly')
    await api('POST', '/api/cruise/goal-runs/' + GOAL_RUN_ID + '/ingest', { phase: 'finalize', status: 'cancelled' })
    process.exit(0)
  }
  if (signal === 'pause') {
    console.log('[enry-cruise-goal] pause signal received, waiting...')
    await stepUpdate('control: paused by user', { output_preview: (resp.json?.control_instructions || 'Waiting for resume signal') })
    while (true) {
      await sleep(10000)
      const check = await api('POST', '/api/cruise/goal-runs/' + GOAL_RUN_ID + '/ingest', { phase: 'heartbeat' })
      if (check.json?.control_signal === 'cancel') {
        console.log('[enry-cruise-goal] cancel during pause, exiting')
        await api('POST', '/api/cruise/goal-runs/' + GOAL_RUN_ID + '/ingest', { phase: 'finalize', status: 'cancelled' })
        process.exit(0)
      }
      if (!check.json?.control_signal) {
        console.log('[enry-cruise-goal] pause cleared, resuming')
        await stepUpdate('control: resumed')
        return 'paused'
      }
    }
  }
  return 'proceed'
}

// Runs the repo's own build script (npm run build — executes package.json's
// "build", e.g. `vite build`, regardless of which package manager installed
// deps). This is the gate for errors tsc/eslint never see: undefined Tailwind
// classes, Vite/Rollup import resolution, asset processing. Returns
// { ran, ok, error }. No build script -> ran:false, ok:true (nothing to gate).
function runBuild() {
  if (!existsSync('package.json')) return { ran: false, ok: true, error: null }
  let pkg
  try { pkg = JSON.parse(readFileSync('package.json', 'utf8')) } catch { return { ran: false, ok: true, error: null } }
  if (!pkg.scripts || !pkg.scripts.build) return { ran: false, ok: true, error: null }
  try {
    execSync('npm run build', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, maxBuffer: 64 * 1024 * 1024 })
    return { ran: true, ok: true, error: null }
  } catch (e) {
    if (e && (e.killed || e.signal === 'SIGTERM' || /ETIMEDOUT/.test(String(e.code)))) {
      return { ran: true, ok: false, error: 'Build timed out after 5 minutes.' }
    }
    // Surface the tail of the build output — where the actual error prints.
    const out = ((e && e.stdout) || '') + '\n' + ((e && e.stderr) || '')
    const snippet = out.split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(-25).join('\n').slice(-1800)
    return { ran: true, ok: false, error: snippet || String((e && e.message) || e) }
  }
}

// Undo an edit's local file writes. `git checkout` only restores TRACKED
// files, so a newly-created file must be deleted outright — otherwise it lingers
// in the working tree and its errors poison every later step's validation
// (they'd look "new"), cascading false reverts.
function revertTouched(touched) {
  for (const t of touched) {
    try {
      if (t.is_new) rmSync(t.path, { force: true })
      else execSync(`git checkout -- "${t.path}"`, { stdio: 'ignore' })
    } catch { /* best effort */ }
  }
}

// Compact, human-readable rendering of the errors an edit introduced, for the
// step detail shown in the UI. Caps the list so a bad edit that trips dozens of
// errors doesn't blow the detail field (ingest caps it at 2000 chars anyway).
function formatErrors(findings) {
  const MAX = 6
  const lines = findings.slice(0, MAX).map((f) => {
    const loc = f.file_path ? `${f.file_path}${f.line_start ? ':' + f.line_start : ''}` : ''
    return `• ${loc ? loc + ' — ' : ''}${f.title}`
  })
  if (findings.length > MAX) lines.push(`…and ${findings.length - MAX} more`)
  return lines.join('\n')
}

// ── Scan-and-fix mode ────────────────────────────────────────────────────────
// Canonical category order + labels. Must match SCANFIX_CATEGORIES in
// src/lib/cruise/types.ts and the step-seeding order in the create route, so
// each category's seq lines up with its seeded step row.
const SCANFIX_ORDER = ['dead_code', 'formatting', 'lint_autofix', 'unused_deps', 'broken_imports', 'debug_statements', 'non_functional_buttons']
const SCANFIX_LABEL = {
  dead_code: 'Dead code removal', formatting: 'Formatting', lint_autofix: 'Lint auto-fixables',
  unused_deps: 'Unused dependencies', broken_imports: 'Broken imports',
  debug_statements: 'Debug statement cleanup', non_functional_buttons: 'Non-functional buttons',
}

// Discard the current (uncommitted) working-tree changes back to the last banked
// state — the scanfix equivalent of revertTouched, used when a category's fix is
// rejected. Restores tracked files and removes files it newly created.
function gitClean() {
  try { execSync('git checkout -- . ; git clean -fd', { stdio: 'ignore' }) } catch { /* best effort */ }
}

// "Bank" an accepted category as a local commit so the next category's git delta
// is isolated (exact per-category commit payload + clean rollback). The runner
// has no push access — these commits are throwaway, local to the Actions
// checkout; every real write to the repo goes through the apply route.
function gitBank() {
  try { execSync('git add -A && git commit -q --no-verify -m "enry-cruise scanfix"', { stdio: 'ignore' }) } catch { /* best effort */ }
}

// This category's working-tree delta: [{ path, deleted, isNew }].
function gitDelta() {
  let out
  try { out = execSync('git status --porcelain -uall', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) } catch { return [] }
  const files = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const x = line[0], y = line[1]
    let path = line.slice(3)
    if (path.includes(' -> ')) path = path.split(' -> ')[1] // rename: take the new path
    if (path.startsWith('"') && path.endsWith('"')) { try { path = JSON.parse(path) } catch { /* keep */ } }
    files.push({ path, deleted: x === 'D' || y === 'D', isNew: x === '?' || x === 'A' })
  }
  return files
}

async function runScanfix(ctx) {
  // Local git identity so gitBank() can commit between categories.
  try { execSync('git config user.email "cruise@enry.agent" && git config user.name "Enry Cruise"', { stdio: 'ignore' }) } catch { /* best effort */ }

  const config = ctx.scanfix_categories || {}
  const cats = SCANFIX_ORDER.filter((c) => config[c] === 'auto_fix')
  if (cats.length === 0) {
    await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'finalize', status: 'no_changes', goal_title: ctx.goal.slice(0, 200) })
    return
  }

  const doneSeqs = new Set((ctx.steps || []).filter((s) => s.status === 'done').map((s) => s.seq))
  let filesChanged = (ctx.files_changed || []).length
  // Baseline blocking errors before any fix — an accepted fix must introduce
  // none new (the same gate the goal loop uses). Advances after each accept.
  let baselineFp = new Set((await blockingFindings(REPO)).map((f) => f.fingerprint))
  let capped = false
  const remaining = []

  for (let seq = 0; seq < cats.length; seq++) {
    await checkControlSignal()
    if (doneSeqs.has(seq)) continue
    const cat = cats[seq]
    if (filesChanged >= CAP_FILES) { capped = true; remaining.push(SCANFIX_LABEL[cat]); continue }
    await stepUpdate(`scanfix: ${SCANFIX_LABEL[cat]}`, { action: `fixing ${cat}` })
    await postStep(seq, 'running')

    let note = ''
    try { note = (CATEGORY_FIXERS[cat](REPO, null) || {}).note || '' }
    catch (e) { gitClean(); await postStep(seq, 'failed', `Fixer crashed: ${(e && e.message) || e}`); continue }

    const delta = gitDelta()
    if (delta.length === 0) { await postStep(seq, 'done', `${note} — no changes`); continue }

    const afterFindings = await blockingFindings(REPO)
    const newErrors = afterFindings.filter((f) => !baselineFp.has(f.fingerprint))
    if (newErrors.length > 0) {
      gitClean()
      await postStep(seq, 'failed', `Reverted — introduced ${newErrors.length} new error(s):\n${formatErrors(newErrors)}`)
      continue
    }

    // Build the commit payload from the delta; deletions carry deleted:true.
    const touched = []
    for (const d of delta) {
      if (d.deleted) { touched.push({ path: d.path, content: '', is_new: false, deleted: true }); continue }
      let content
      try { content = readFileSync(d.path, 'utf8') } catch { continue }
      touched.push({ path: d.path, content, is_new: d.isNew })
    }
    if (touched.length === 0) { gitClean(); await postStep(seq, 'done', `${note} — nothing to commit`); continue }

    // Commit in <=25-file chunks (the apply route's per-call limit); all chunks
    // land on the same branch -> one PR.
    let applyErr = null
    for (let i = 0; i < touched.length; i += 25) {
      const applyRes = await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/apply`, {
        files: touched.slice(i, i + 25),
        message: `Enry Cruise: ${SCANFIX_LABEL[cat]} — ${note}`.slice(0, 200),
      })
      if (applyRes.json?.error === 'file_cap_exceeded') { applyErr = 'cap'; break }
      if (!applyRes.ok || !applyRes.json?.ok) { applyErr = applyRes.json?.error || `Apply failed (HTTP ${applyRes.status})`; break }
      filesChanged = applyRes.json.files_changed
    }
    if (applyErr === 'cap') {
      gitClean()
      await postStep(seq, 'failed', 'Skipped — file cap reached')
      capped = true
      remaining.push(...cats.slice(seq).map((c) => SCANFIX_LABEL[c]))
      break
    }
    if (applyErr) { gitClean(); await postStep(seq, 'failed', applyErr); continue }

    gitBank()
    baselineFp = new Set(afterFindings.map((f) => f.fingerprint))
    await postStep(seq, 'done', `${note} — ${touched.length} file(s)`)
  }

  let buildOk = true, buildError = null
  if (filesChanged > 0) { const b = runBuild(); buildOk = b.ok; buildError = b.error }
  const status = filesChanged === 0 ? 'no_changes' : capped ? 'capped' : 'completed'
  await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, {
    phase: 'finalize',
    status,
    goal_title: ctx.goal.slice(0, 200),
    pr_summary: `Enry Cruise scan-and-fix over ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}: ${cats.map((c) => SCANFIX_LABEL[c]).join(', ')}. ${filesChanged} file(s) changed.`,
    remaining_summary: remaining.length > 0 ? remaining.map((s, i) => `${i + 1}. ${s}`).join('\n') : undefined,
    build_ok: buildOk,
    build_error: buildError,
  })
  console.log(`[enry-cruise-goal] scanfix done: status=${status} files_changed=${filesChanged} build_ok=${buildOk}`)
}

async function main() {
  await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'start' })

  const ctxRes = await api('GET', `/api/cruise/goal-runs/${GOAL_RUN_ID}/context`)
  if (!ctxRes.ok) {
    console.error('[enry-cruise-goal] could not fetch context:', ctxRes.status)
    process.exit(1)
  }
  const ctx = ctxRes.json

  // Scan-and-fix mode: no LLM, no planning. Iterate the enabled auto-fix
  // categories, each running a deterministic fixer through the same
  // validate -> revert/commit -> build gate the goal loop uses.
  if (ctx.mode === 'scanfix') { await runScanfix(ctx); return }

  let plan = ctx.plan
  const doneSeqs = new Set((ctx.steps || []).filter((s) => s.status === 'done').map((s) => s.seq))
  let filesChanged = (ctx.files_changed || []).length

  // ── Planning (skipped on resume once a plan already exists) ────────────────
  if (!plan) {
    const clarifyContext = ctx.clarify_question
      ? `\n\nA prior planning pass asked the user: "${ctx.clarify_question}"\nThe user answered: "${ctx.clarify_answer}"\nIncorporate that answer; do not ask the same question again unless a genuinely new ambiguity exists.`
      : ''
    const planRes = await llm([
      { role: 'system', content: `You are an autonomous coding agent working inside a checked-out git repo (${REPO}). You will be given a goal and a repo overview. Respond with ONLY a JSON object, no prose outside it.

If the goal is unsafe, destructive without specifics, or too ambiguous to act on without a real risk of doing the wrong thing (e.g. "delete the old auth system" with no detail on what replaces it or what's safe to remove), respond: {"safe": false, "question": "<one sharp clarifying question>"}.

Otherwise respond: {"safe": true, "plan": ["<step 1 description>", "<step 2 description>", ...]}. Each step should be a small, concrete, independently-committable unit of work (e.g. "Add a ThemeProvider context in src/theme/theme-context.tsx" not "add dark mode"). Mention concrete file paths in step descriptions where you can — later steps use them to know what to read. Keep the plan to at most ${MAX_PLAN_STEPS} steps and only as many as the goal actually needs.

Keep each step small enough that ONE model call can generate its content quickly — a single call must finish in under a minute, so no step should generate a large file or a lot of content at once. When a piece of work would produce a lot at once (a full theme's CSS custom properties, a big config, many similar entries), SPLIT it into several steps: one to create the file with the first chunk, then follow-up steps each phrased as "Add/append <the next chunk> to <that same file>". For example, instead of one "Add CSS custom properties for light and dark themes to src/index.css", emit: "Create src/index.css with the light-theme :root custom properties", then "Append the .dark theme custom properties to src/index.css", then "Append the @layer base bg-background/text-foreground setup to src/index.css". Prefer more small append steps over one big generation.` },
      { role: 'user', content: `GOAL: ${ctx.goal}${clarifyContext}\n\nREPO OVERVIEW:\n${repoOverview()}` },
    ])
    if (planRes.budgetExceeded) {
      await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'finalize', status: 'failed', error: 'LLM budget exhausted during planning.' })
      return
    }
    if (planRes.failed) {
      await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'finalize', status: 'failed', error: `Planner LLM call failed — ${describeLlmFailure(planRes)}` })
      return
    }
    const parsed = extractJson(planRes.text)
    if (!parsed) {
      await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'finalize', status: 'failed', error: 'Planner returned an unparseable response.' })
      return
    }
    if (parsed.safe === false) {
      await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'clarify', question: parsed.question || 'This goal is ambiguous — can you clarify what you want?' })
      console.log('[enry-cruise-goal] paused for clarification')
      return
    }
    plan = Array.isArray(parsed.plan) ? parsed.plan.slice(0, MAX_PLAN_STEPS).map(String) : []
    if (plan.length === 0) {
      await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'finalize', status: 'failed', error: 'Planner returned no steps.' })
      return
    }
    await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'plan', steps: plan })
  }

  // ── Edit loop ────────────────────────────────────────────────────────────
  // Baseline = the blocking errors already present before we touch anything,
  // keyed by fingerprint (line-independent, so an edit above a pre-existing
  // error doesn't make it look new). An edit is accepted only if it introduces
  // no NEW fingerprints. After each accepted commit the baseline advances to
  // that state, so every step is judged against the last good state.
  let baselineFp = new Set((await blockingFindings(REPO)).map((f) => f.fingerprint))
  const remaining = []
  let capped = false
  // Paths this run has already created/changed (seeded from prior dispatches on
  // resume). Fed to the editor so a later step references the REAL module a
  // earlier step made instead of guessing its name/exports.
  const changedThisRun = new Set(ctx.files_changed || [])
  // The repo's real file list, refreshed lazily as the run adds files.
  let repoFiles = listFiles()

  // Fix mode (plan derived from scan findings) uses a tighter editor prompt:
  // resolve ONLY the listed findings with the minimal change, delete dead code,
  // never add features. Goal mode uses the general build-a-feature prompt.
  const editorSystem = ctx.mode === 'fix' ? FIX_EDITOR_SYSTEM : GOAL_EDITOR_SYSTEM

  for (let seq = 0; seq < plan.length; seq++) {
    await checkControlSignal()
    if (doneSeqs.has(seq)) continue
    const stepDesc = plan[seq]

    if (filesChanged >= CAP_FILES) { capped = true; remaining.push(stepDesc); continue }

    await stepUpdate(`step ${seq + 1}/${plan.length}: ${stepDesc.slice(0, 100)}`, { action: stepDesc.slice(0, 80) })
    await postStep(seq, 'running')

    const paths = extractPaths(stepDesc)
    const existingContent = paths
      .map((p) => { const c = readIfExists(p); return c !== null ? `--- ${p} (existing) ---\n${c.slice(0, 6000)}` : null })
      .filter(Boolean)
      .join('\n\n')
    const changedList = changedThisRun.size > 0 ? [...changedThisRun].join('\n') : '(none yet)'

    const editRes = await llm([
      { role: 'system', content: editorSystem },
      { role: 'user', content: `GOAL: ${ctx.goal}\n\nCURRENT STEP: ${stepDesc}\n\nREPO FILES (real paths — import only from these or installed packages):\n${repoFiles.join('\n')}\n\nFILES CHANGED THIS RUN:\n${changedList}\n\nEXISTING CONTENT OF FILES THIS STEP TOUCHES:\n${existingContent || '(none matched by path — create what is needed)'}` },
    ])
    if (editRes.budgetExceeded) {
      await postStep(seq, 'failed', 'LLM budget exhausted')
      capped = true
      remaining.push(stepDesc, ...plan.slice(seq + 1))
      break
    }
    if (editRes.failed) {
      // Transport/proxy/timeout/empty failure, after retries — NOT a malformed
      // parse and NOT a lint revert. Report the real reason.
      await postStep(seq, 'failed', `Editor LLM call failed after retries — ${describeLlmFailure(editRes)}`)
      continue
    }
    const parsed = parseEdits(editRes.text)
    if (!parsed.matchedAny) {
      // Distinct from a transport failure: we GOT a response, but it contained
      // no file blocks / NO-CHANGES sentinel. Surface a snippet to diagnose.
      const snippet = String(editRes.text || '').replace(/\s+/g, ' ').trim().slice(0, 600)
      await postStep(seq, 'failed', `Malformed editor response — no file blocks found. Raw response:\n${snippet || '(empty)'}`)
      continue
    }
    if (parsed.noChanges || parsed.files.length === 0) {
      await postStep(seq, 'done', parsed.note || 'no changes needed')
      continue
    }

    // Write locally and validate before proposing anything — a step that
    // makes tsc/eslint worse gets reverted rather than committed.
    const touched = []
    let writeError = null
    for (const f of parsed.files) {
      // Keep writes inside the checkout: reject absolute paths and any that
      // climb out via '..' (malformed/hostile path from the model).
      const p = normalize(f.path)
      if (isAbsolute(p) || p.split(/[\\/]/).includes('..')) { writeError = `unsafe path "${f.path}"`; break }
      const existed = existsSync(p)
      // APPEND emits only a chunk; the file on disk (and the commit) must be the
      // full concatenation. FILE is the whole file as-is. Either way `touched`
      // carries the COMPLETE content — the small thing is the model's output.
      let content = f.content
      if (f.mode === 'append') {
        const prior = existed ? readFileSync(p, 'utf8') : ''
        const sep = prior && !prior.endsWith('\n') ? '\n' : ''
        content = prior + sep + f.content + (f.content.endsWith('\n') ? '' : '\n')
      }
      try {
        // Create parent dirs first — the model routinely puts a new file in a
        // new directory (e.g. src/context/theme-provider.tsx). writeFileSync
        // does NOT mkdir, so without this it throws ENOENT and crashed the run.
        mkdirSync(dirname(p), { recursive: true })
        writeFileSync(p, content, 'utf8')
      } catch (e) { writeError = `${(e && e.code) || 'write error'} writing ${p}`; break }
      touched.push({ path: p, content, is_new: !existed })
    }
    if (writeError) {
      revertTouched(touched) // undo any partial writes from this step
      await postStep(seq, 'failed', `Could not write files: ${writeError}`)
      continue
    }
    if (touched.length === 0) { await postStep(seq, 'failed', 'No valid file entries'); continue }

    const afterFindings = await blockingFindings(REPO)
    const newErrors = afterFindings.filter((f) => !baselineFp.has(f.fingerprint))
    if (newErrors.length > 0) {
      // Revert via git — the checkout has no other uncommitted changes at
      // this point (each step commits or reverts before the next begins).
      revertTouched(touched)
      await postStep(seq, 'failed', `Reverted — introduced ${newErrors.length} new error(s):\n${formatErrors(newErrors)}`)
      continue
    }

    const applyRes = await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/apply`, {
      files: touched,
      message: `Enry Cruise: ${(parsed.note || stepDesc).slice(0, 200)}`,
    })
    if (applyRes.json?.error === 'file_cap_exceeded') {
      revertTouched(touched)
      await postStep(seq, 'failed', 'Skipped — file cap reached')
      capped = true
      remaining.push(stepDesc, ...plan.slice(seq + 1))
      break
    }
    if (!applyRes.ok || !applyRes.json?.ok) {
      // Hard commit failure — treat exactly like a validation revert: undo the
      // local edit, mark THIS step failed, and continue to the next step. Never
      // abort the run. The apply route already labels its errors, so don't
      // double-prefix. (applyRes.json.error already reads e.g. "Commit failed:
      // GitHub API error 404" or "request timed out after 45000ms".)
      revertTouched(touched)
      await postStep(seq, 'failed', applyRes.json?.error || `Apply failed (HTTP ${applyRes.status})`)
      continue
    }
    filesChanged = applyRes.json.files_changed
    baselineFp = new Set(afterFindings.map((f) => f.fingerprint)) // accepted state is the new baseline
    // Later steps should see what this one just created — real paths to import
    // from, not guesses.
    for (const t of touched) { if (t.is_new) { changedThisRun.add(t.path); repoFiles.push(t.path) } else changedThisRun.add(t.path) }
    await postStep(seq, 'done', parsed.note || `${touched.length} file(s) changed`)
  }

  // Build gate: tsc/eslint can't see everything the real build does (CSS/Tailwind
  // classes, Vite/Rollup import resolution). Before finalizing a run that changed
  // files, run the repo's OWN build. A failure doesn't discard the work — the
  // server opens the PR as a DRAFT and marks the run build_failed so it's clearly
  // not mergeable, rather than a clean green 'completed'.
  let buildOk = true
  let buildError = null
  if (filesChanged > 0) {
    const b = runBuild()
    buildOk = b.ok
    buildError = b.error
    if (b.ran) console.log(`[enry-cruise-goal] build: ${b.ok ? 'passed' : 'FAILED'}`)
  }

  // Honest terminal status: nothing that opens a PR gets called 'completed'.
  // Zero surviving changes -> 'no_changes' (every step reverted, or the goal
  // needed no edits); capped with real changes -> 'capped'; otherwise done. The
  // server downgrades completed/capped to 'build_failed' if buildOk is false.
  const status = filesChanged === 0 ? 'no_changes' : capped ? 'capped' : 'completed'
  await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, {
    phase: 'finalize',
    status,
    goal_title: ctx.goal.slice(0, 200),
    pr_summary: `Goal: ${ctx.goal}\n\nWorked autonomously by Enry Cruise. ${plan.length} planned step(s), ${filesChanged} file(s) changed.`,
    remaining_summary: remaining.length > 0 ? remaining.map((s, i) => `${i + 1}. ${s}`).join('\n') : undefined,
    build_ok: buildOk,
    build_error: buildError,
  })
  console.log(`[enry-cruise-goal] done: status=${status} files_changed=${filesChanged} build_ok=${buildOk}`)
}

main().catch(async (e) => {
  console.error('[enry-cruise-goal] fatal:', e)
  await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'finalize', status: 'failed', error: String(e && e.message || e) }).catch(() => {})
  process.exit(1)
})
