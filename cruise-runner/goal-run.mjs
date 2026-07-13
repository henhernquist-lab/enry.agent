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

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { blockingErrorCount } from './lib/analyzers.mjs'

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

function extractJson(text) {
  const stripped = String(text || '').replace(/```json\s*|```/g, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try { return JSON.parse(stripped.slice(start, end + 1)) } catch { return null }
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
  const baseline = blockingErrorCount(REPO)
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
      { role: 'system', content: `You are editing files in a checked-out git repo to accomplish one step of a larger goal. Respond with ONLY a JSON object: {"files": [{"path": "<repo-relative path>", "content": "<COMPLETE new file content>"}], "note": "<one-line summary of what you changed>"}. Always give the FULL file content, never a diff/snippet. Only include files this step actually needs to touch. If the step doesn't require any file changes (e.g. it's already satisfied), return {"files": [], "note": "already satisfied"}.` },
      { role: 'user', content: `GOAL: ${ctx.goal}\n\nCURRENT STEP: ${stepDesc}\n\n${existingContent || '(no existing files matched this step by path — create what\'s needed)'}` },
    ])
    if (editRes.error === 'budget_exceeded') {
      await postStep(seq, 'failed', 'LLM budget exhausted')
      capped = true
      remaining.push(stepDesc, ...plan.slice(seq + 1))
      break
    }
    const parsed = extractJson(editRes.text)
    if (!parsed || !Array.isArray(parsed.files)) {
      await postStep(seq, 'failed', 'Editor returned an unparseable response')
      continue
    }
    if (parsed.files.length === 0) {
      await postStep(seq, 'done', parsed.note || 'no changes needed')
      continue
    }

    // Write locally and validate before proposing anything — a step that
    // makes tsc/eslint worse gets reverted rather than committed.
    const touched = []
    for (const f of parsed.files) {
      if (typeof f.path !== 'string' || typeof f.content !== 'string') continue
      const isNew = !existsSync(f.path)
      writeFileSync(f.path, f.content, 'utf8')
      touched.push({ path: f.path, content: f.content, is_new: isNew })
    }
    if (touched.length === 0) { await postStep(seq, 'failed', 'No valid file entries'); continue }

    const after = blockingErrorCount(REPO)
    if (after > baseline) {
      // Revert via git — the checkout has no other uncommitted changes at
      // this point (each step commits or reverts before the next begins).
      try { execSync('git checkout -- ' + touched.map((t) => `"${t.path}"`).join(' '), { stdio: 'ignore' }) } catch { /* best effort */ }
      await postStep(seq, 'failed', `Reverted — introduced ${after - baseline} new type/lint error(s)`)
      continue
    }

    const applyRes = await api('POST', `/api/cruise/goal-runs/${GOAL_RUN_ID}/apply`, {
      files: touched,
      message: `Enry Cruise: ${(parsed.note || stepDesc).slice(0, 200)}`,
    })
    if (applyRes.json?.error === 'file_cap_exceeded') {
      try { execSync('git checkout -- ' + touched.map((t) => `"${t.path}"`).join(' '), { stdio: 'ignore' }) } catch { /* best effort */ }
      await postStep(seq, 'failed', 'Skipped — file cap reached')
      capped = true
      remaining.push(stepDesc, ...plan.slice(seq + 1))
      break
    }
    if (!applyRes.ok || !applyRes.json?.ok) {
      await postStep(seq, 'failed', `Commit failed: ${applyRes.json?.error || applyRes.status}`)
      continue
    }
    filesChanged = applyRes.json.files_changed
    await postStep(seq, 'done', parsed.note || `${touched.length} file(s) changed`)
  }

  const status = capped ? 'capped' : 'completed'
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
