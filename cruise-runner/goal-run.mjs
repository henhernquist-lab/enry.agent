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

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs'
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
  const res = await fetch(CALLBACK + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

async function llm(messages) {
  const { json } = await api('POST', '/api/cruise/llm', { goal_run_id: GOAL_RUN_ID, messages })
  return json
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
// No JSON escaping of file bodies — content is whatever sits between the
// ===FILE:...=== and ===ENDFILE=== markers, verbatim. matchedAny is false only
// when the model produced neither a file block nor the NO-CHANGES sentinel,
// i.e. a genuinely malformed response worth surfacing.
function parseEdits(text) {
  const raw = String(text || '')
  const files = []
  const re = /===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)\r?\n===ENDFILE===/g
  let m
  while ((m = re.exec(raw)) !== null) {
    const path = m[1].trim()
    if (path) files.push({ path, content: m[2] })
  }
  const noChanges = /===\s*NO CHANGES\s*===/.test(raw)
  const noteM = raw.match(/===NOTE:\s*([\s\S]*?)===/)
  const note = noteM ? noteM[1].trim().slice(0, 200) : ''
  return { files, note, noChanges, matchedAny: files.length > 0 || noChanges }
}

// Small repo context for the planner: a capped file tree + a couple of
// well-known manifest files, not a full checkout dump.
function repoOverview() {
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
  let manifest = ''
  for (const f of ['package.json', 'tsconfig.json']) {
    if (existsSync(f)) manifest += `\n\n--- ${f} ---\n` + readFileSync(f, 'utf8').slice(0, 3000)
  }
  return lines.join('\n') + manifest
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

Otherwise respond: {"safe": true, "plan": ["<step 1 description>", "<step 2 description>", ...]}. Each step should be a small, concrete, independently-committable unit of work (e.g. "Add a ThemeProvider context in src/theme/theme-context.tsx" not "add dark mode"). Mention concrete file paths in step descriptions where you can — later steps use them to know what to read. Keep the plan to at most ${MAX_PLAN_STEPS} steps and only as many as the goal actually needs.` },
      { role: 'user', content: `GOAL: ${ctx.goal}${clarifyContext}\n\nREPO OVERVIEW:\n${repoOverview()}` },
    ])
    if (planRes.error === 'budget_exceeded') {
      await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/ingest`, { phase: 'finalize', status: 'failed', error: 'LLM budget exhausted during planning.' })
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
  let baselineFp = new Set(blockingFindings(REPO).map((f) => f.fingerprint))
  const remaining = []
  let capped = false

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

    const editRes = await llm([
      { role: 'system', content: `You are editing files in a checked-out git repo to accomplish one step of a larger goal.

Do NOT use JSON — file contents break JSON escaping. Use this exact marker format instead. For each file you create or replace, emit a block:
===FILE: <repo-relative path>===
<the COMPLETE new file content, verbatim — no diff, no snippet, no fencing>
===ENDFILE===

After all file blocks, emit one line:
===NOTE: <one-line summary of what you changed>===

If the step needs no file changes (already satisfied), output exactly one line and nothing else:
===NO CHANGES===

Rules: output only file blocks + the NOTE line (or NO CHANGES). No prose, no markdown fences. Match the repo's existing conventions, imports, and framework idioms — read the provided existing files first.` },
      { role: 'user', content: `GOAL: ${ctx.goal}\n\nCURRENT STEP: ${stepDesc}\n\n${existingContent || '(no existing files matched this step by path — create what\'s needed)'}` },
    ])
    if (editRes.error === 'budget_exceeded') {
      await postStep(seq, 'failed', 'LLM budget exhausted')
      capped = true
      remaining.push(stepDesc, ...plan.slice(seq + 1))
      break
    }
    const parsed = parseEdits(editRes.text)
    if (!parsed.matchedAny) {
      // Distinct from a lint-error revert: the model's OUTPUT itself was
      // malformed (no file blocks, no NO-CHANGES sentinel). Surface a snippet
      // of the raw response so it's diagnosable rather than opaque.
      const snippet = String(editRes.text || '').replace(/\s+/g, ' ').trim().slice(0, 600)
      await postStep(seq, 'failed', `Malformed editor response — no file blocks found. Raw response:\n${snippet || '(empty response)'}`)
      continue
    }
    if (parsed.noChanges || parsed.files.length === 0) {
      await postStep(seq, 'done', parsed.note || 'no changes needed')
      continue
    }

    // Write locally and validate before proposing anything — a step that
    // makes tsc/eslint worse gets reverted rather than committed.
    const touched = []
    for (const f of parsed.files) {
      const isNew = !existsSync(f.path)
      writeFileSync(f.path, f.content, 'utf8')
      touched.push({ path: f.path, content: f.content, is_new: isNew })
    }
    if (touched.length === 0) { await postStep(seq, 'failed', 'No valid file entries'); continue }

    const afterFindings = blockingFindings(REPO)
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
