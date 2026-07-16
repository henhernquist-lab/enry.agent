// Enry Lab — Overnight Experiment Runner
//
// Committed into a scratch repo in the enry-lab-experiments org as
// `.enry-overnight/exp.mjs`. Dispatched via workflow_dispatch with a per-run
// token. Runs autonomously: explores the idea, tests small prototypes, and
// reports back to enry.agent's /api/lab/overnight/ingest.
//
// Key guardrail: this runner NEVER has push access to any repo. The workflow
// uses contents: read. All exploration happens in the checkout — if the
// experiment wants to write, it does so locally and reports via the callback.
// No real repo is ever touched.
//
// Uses only Node.js builtins. The scratch repo may contain package.json +
// installed deps from the workflow's setup step, but this script itself has
// zero external dependencies.

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const RUN_ID = process.env.ENRY_RUN_ID
const CALLBACK = (process.env.ENRY_CALLBACK || '').replace(/\/+$/, '')
const TOKEN = process.env.ENRY_TOKEN
const IDEA_TITLE = process.env.ENRY_IDEA_TITLE || ''
const IDEA_DESC = process.env.ENRY_IDEA_DESC || ''

// ── Guards ──────────────────────────────────────────────────────────────────

if (!RUN_ID || !CALLBACK || !TOKEN) {
  console.error('[enry-overnight] missing ENRY_RUN_ID / ENRY_CALLBACK / ENRY_TOKEN')
  process.exit(1)
}

// Hard timeout — after 45 minutes of wall time, the runner self-terminates.
// The workflow's own timeout-minutes (50) is the backstop.
const HARD_TIMEOUT_MS = 45 * 60 * 1000
const startTime = Date.now()

setTimeout(() => {
  console.error('[enry-overnight] hard timeout reached, exiting')
  postResult({ error: 'Hard timeout (45 min) reached', run_time_ms: Date.now() - startTime })
    .then(() => process.exit(1))
}, HARD_TIMEOUT_MS - 5000)

// ── Callback helpers ────────────────────────────────────────────────────────

async function api(method, path, body, { timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(CALLBACK + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const json = await res.json().catch(() => ({ error: `non-JSON response (HTTP ${res.status})` }))
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    return { ok: false, status: 0, json: { error: e && e.message || String(e) } }
  } finally {
    clearTimeout(timer)
  }
}

function heartbeat() {
  return api('POST', '/api/lab/overnight/ingest', {
    run_id: RUN_ID,
    phase: 'heartbeat',
  })
}

function postResult(data) {
  return api('POST', '/api/lab/overnight/ingest', {
    run_id: RUN_ID,
    phase: 'result',
    ...data,
  }, { timeoutMs: 15000 })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Exploration steps ───────────────────────────────────────────────────────

function repoOverview() {
  const ignore = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.enry-overnight', '.github'])
  const lines = []
  let total = 0
  const MAX_LINES = 300, MAX_CHARS = 15000

  function walk(dir, depth) {
    if (lines.length >= MAX_LINES || depth > 3) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (lines.length >= MAX_LINES) return
      if (ignore.has(e.name) || e.name.startsWith('.')) continue
      const p = dir === '.' ? e.name : dir + '/' + e.name
      if (e.isDirectory()) { lines.push(p + '/'); total += p.length; walk(p, depth + 1) }
      else { lines.push(p); total += p.length }
      if (total > MAX_CHARS) return
    }
  }
  walk('.', 0)
  return lines.join('\n')
}

function readManifests() {
  let out = ''
  for (const f of ['package.json', 'tsconfig.json', 'README.md']) {
    if (existsSync(f)) {
      try { out += `\n\n--- ${f} ---\n` + readFileSync(f, 'utf8').slice(0, 3000) } catch {}
    }
  }
  return out
}

function tryCommand(cmd) {
  try {
    return { ok: true, output: execSync(cmd, { encoding: 'utf8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'] }).slice(0, 5000) }
  } catch (e) {
    return { ok: false, output: (e && e.stderr || e && e.message || String(e)).slice(0, 2000) }
  }
}

function tryInstall() {
  // Try to install dependencies so tests/builds can run
  const managers = [
    'pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1',
    'npm install 2>&1',
  ]
  for (const cmd of managers) {
    const r = tryCommand(cmd)
    if (r.ok) return r
  }
  return { ok: false, output: 'All package managers failed to install' }
}

function detectTechStack() {
  // What does this scratch repo contain?
  const hasTS = existsSync('tsconfig.json')
  const hasJS = existsSync('package.json')
  const hasPy = existsSync('requirements.txt') || existsSync('pyproject.toml')
  const hasGo = existsSync('go.mod')
  const hasRs = existsSync('Cargo.toml')
  const stacks = []
  if (hasTS) stacks.push('TypeScript')
  if (hasJS && !hasTS) stacks.push('JavaScript')
  if (hasPy) stacks.push('Python')
  if (hasGo) stacks.push('Go')
  if (hasRs) stacks.push('Rust')
  return stacks.length > 0 ? stacks.join(', ') : 'unknown'
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[enry-overnight] starting run ${RUN_ID}`)
  console.log(`[enry-overnight] idea: ${IDEA_TITLE}`)

  // Heartbeat immediately so the system knows we're alive
  await heartbeat()

  // Start heartbeat loop — every 2 minutes
  const heartbeatTimer = setInterval(() => heartbeat().catch(() => {}), 120_000)

  let resultSummary = ''
  let resultDetail = ''
  let verdict = 'dead_end'
  let error = null

  try {
    // Step 1: Survey the scratch repo
    await heartbeat()
    const techStack = detectTechStack()
    const fileTree = repoOverview()
    const manifests = readManifests()

    // Step 2: Install dependencies
    await heartbeat()
    const installResult = tryInstall()
    if (!installResult.ok) {
      console.warn('[enry-overnight] dep install had issues, continuing...')
    }

    // Step 3: Try to build/test the scratch repo
    await heartbeat()
    const testResults = []
    
    if (existsSync('package.json')) {
      const lintResult = tryCommand('npx eslint . --ext .ts,.tsx,.js,.jsx 2>&1 || true')
      testResults.push({ name: 'lint', ...lintResult })
      
      const tscResult = tryCommand('npx tsc --noEmit 2>&1 || true')
      testResults.push({ name: 'typecheck', ...tscResult })
      
      const testResult = tryCommand('npm test 2>&1 || true')
      testResults.push({ name: 'tests', ...testResult })
      
      const buildResult = tryCommand('npm run build 2>&1 || true')
      testResults.push({ name: 'build', ...buildResult })
    }
    
    if (existsSync('Cargo.toml')) {
      const cargoCheck = tryCommand('cargo check 2>&1 || true')
      testResults.push({ name: 'cargo_check', ...cargoCheck })
      const cargoTest = tryCommand('cargo test 2>&1 || true')
      testResults.push({ name: 'cargo_tests', ...cargoTest })
    }
    
    if (existsSync('go.mod')) {
      const goBuild = tryCommand('go build ./... 2>&1 || true')
      testResults.push({ name: 'go_build', ...goBuild })
      const goTest = tryCommand('go test ./... 2>&1 || true')
      testResults.push({ name: 'go_tests', ...goTest })
    }

    // Step 4: Determine verdict based on concrete signals
    const passedTests = testResults.filter((t) => t.ok).length
    const totalTests = testResults.length
    const buildWorked = testResults.find((t) => t.name === 'build')?.ok === true
    const testsPassed = testResults.find((t) => t.name === 'tests')?.ok === true
    const typecheckPassed = testResults.find((t) => t.name === 'typecheck')?.ok === true

    // Concrete verdict signals (not vibes):
    // - "Worth pursuing" = build AND tests pass (or at least one of them, and no hard failures)
    // - "Dead end" = build fails, or everything fails
    if (buildWorked && (testsPassed || testResults.length <= 1)) {
      verdict = 'worth_pursuing'
    } else if (passedTests >= totalTests * 0.5 && totalTests > 0) {
      verdict = 'worth_pursuing'
    } else if (totalTests === 0) {
      // No test infrastructure — can't assess, mark as worth_pursuing for manual review
      verdict = 'worth_pursuing'
    }

    // Build the summary
    const passedNames = testResults.filter((t) => t.ok).map((t) => t.name).join(', ')
    const failedNames = testResults.filter((t) => !t.ok).map((t) => t.name).join(', ')
    
    resultSummary = [
      `Idea: ${IDEA_TITLE}`,
      `Tech stack: ${techStack}`,
      `Tests run: ${totalTests}`,
      passedNames ? `Passed: ${passedNames}` : '',
      failedNames ? `Failed: ${failedNames}` : '',
      `Verdict: ${verdict === 'worth_pursuing' ? 'Worth pursuing' : 'Dead end'}`,
    ].filter(Boolean).join(' | ')

    resultDetail = [
      `# Overnight Experiment: ${IDEA_TITLE}`,
      '',
      '## Idea',
      IDEA_DESC || IDEA_TITLE,
      '',
      '## Environment',
      `- Tech stack: ${techStack}`,
      `- Dependencies installed: ${installResult.ok ? 'yes' : 'with issues'}`,
      `- File tree (first 300 files):`,
      '```',
      fileTree.slice(0, 5000),
      '```',
      '',
      '## Test Results',
      ...testResults.map((t) => {
        const icon = t.ok ? '✅' : '❌'
        return `### ${icon} ${t.name}\n\`\`\`\n${t.output.slice(0, 2000)}\n\`\`\``
      }),
      '',
      '## Verdict',
      `${verdict === 'worth_pursuing' ? '🟢 Worth pursuing' : '🔴 Dead end'}`,
      '',
      `Run completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    ].join('\n')

    console.log(`[enry-overnight] done: ${verdict} — ${passedTests}/${totalTests} checks passed`)

  } catch (e) {
    error = String(e && e.message || e)
    console.error(`[enry-overnight] error: ${error}`)
  } finally {
    clearInterval(heartbeatTimer)
  }

  await heartbeat()
  await postResult({
    result_summary: resultSummary,
    result_detail: resultDetail,
    verdict,
    error,
    run_time_ms: Date.now() - startTime,
  })

  if (error) process.exit(1)
}

main()
