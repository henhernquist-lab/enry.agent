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
import { blockingFindings } from './lib/analyzers.mjs'

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

async function api(method, path, body) {
  try {
    const res = await fetch(CALLBACK + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: body ? JSON.stringify(body) : undefined,
    })
    // A Vercel function timeout (e.g. the 504 on a slow completion) returns an
    // HTML body, not JSON — catch that so it surfaces as a transport failure
    // rather than an empty {} the caller misreads as "model returned nothing".
    const json = await res.json().catch(() => ({ error: `non-JSON response (HTTP ${res.status})` }))
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    return { ok: false, status: 0, json: { error: 'network: ' + (e && e.message || e) } }
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
    const { ok, status, json } = await api('POST', '/api/cruise/llm', { goal_run_id: GOAL_RUN_ID, messages })
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

async function main() {
  await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'start' })

  const ctxRes = await api('GET', `/api/cruise/goal-runs/${GOAL_RUN_ID}/context`)
  if (!ctxRes.ok) {
    console.error('[enry-cruise-goal] could not fetch context:', ctxRes.status)
    process.exit(1)
  }
  const ctx = ctxRes.json
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

  for (let seq = 0; seq < plan.length; seq++) {
    if (doneSeqs.has(seq)) continue
    const stepDesc = plan[seq]

    if (filesChanged >= CAP_FILES) { capped = true; remaining.push(stepDesc); continue }

    await postStep(seq, 'running')

    const paths = extractPaths(stepDesc)
    const existingContent = paths
      .map((p) => { const c = readIfExists(p); return c !== null ? `--- ${p} (existing) ---\n${c.slice(0, 6000)}` : null })
      .filter(Boolean)
      .join('\n\n')
    const changedList = changedThisRun.size > 0 ? [...changedThisRun].join('\n') : '(none yet)'

    const editRes = await llm([
      { role: 'system', content: `You are editing files in a checked-out git repo to accomplish one step of a larger goal.

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
- Include every import your code uses (e.g. React hooks like useState/useEffect). Do not reference an identifier you didn't import or define.` },
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
      revertTouched(touched)
      await postStep(seq, 'failed', `Commit failed: ${applyRes.json?.error || applyRes.status}`)
      continue
    }
    filesChanged = applyRes.json.files_changed
    baselineFp = new Set(afterFindings.map((f) => f.fingerprint)) // accepted state is the new baseline
    // Later steps should see what this one just created — real paths to import
    // from, not guesses.
    for (const t of touched) { if (t.is_new) { changedThisRun.add(t.path); repoFiles.push(t.path) } else changedThisRun.add(t.path) }
    await postStep(seq, 'done', parsed.note || `${touched.length} file(s) changed`)
  }

  // Honest terminal status: nothing that opens a PR gets called 'completed'.
  // Zero surviving changes -> 'no_changes' (every step reverted, or the goal
  // needed no edits); capped with real changes -> 'capped'; otherwise done.
  const status = filesChanged === 0 ? 'no_changes' : capped ? 'capped' : 'completed'
  await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, {
    phase: 'finalize',
    status,
    goal_title: ctx.goal.slice(0, 200),
    pr_summary: `Goal: ${ctx.goal}\n\nWorked autonomously by Enry Cruise. ${plan.length} planned step(s), ${filesChanged} file(s) changed.`,
    remaining_summary: remaining.length > 0 ? remaining.map((s, i) => `${i + 1}. ${s}`).join('\n') : undefined,
  })
  console.log(`[enry-cruise-goal] done: status=${status} files_changed=${filesChanged}`)
}

main().catch(async (e) => {
  console.error('[enry-cruise-goal] fatal:', e)
  await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'finalize', status: 'failed', error: String(e && e.message || e) }).catch(() => {})
  process.exit(1)
})
