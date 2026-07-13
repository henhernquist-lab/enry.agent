// Enry Cruise — Phase 1 static analyzer.
//
// Committed into an allowlisted repo by enry.agent as `.enry-cruise/scan.mjs`.
// Runs on GitHub's runner after the repo's deps are installed. Produces static
// findings (type errors, lint issues, unused imports / dead code, broken import
// paths) by running the repo's OWN tsc/eslint, then posts them back to
// enry.agent's /api/cruise/ingest — authenticated by the per-scan token in
// ENRY_TOKEN. Node builtins only; no dependencies to install.

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'

const SCAN_ID = process.env.ENRY_SCAN_ID
const CALLBACK = process.env.ENRY_CALLBACK
const TOKEN = process.env.ENRY_TOKEN
const REPO = process.env.ENRY_REPO || ''
const CWD = process.cwd()
const MAX_FINDINGS = 500

if (!SCAN_ID || !CALLBACK || !TOKEN) {
  console.error('[enry-cruise] missing ENRY_SCAN_ID / ENRY_CALLBACK / ENRY_TOKEN')
  process.exit(1)
}

function localBin(name) {
  const p = 'node_modules/.bin/' + name
  return existsSync(p) ? './' + p : null
}

function run(cmd) {
  try {
    return { code: 0, out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }) }
  } catch (e) {
    // tsc / eslint exit non-zero when they find issues but still print the
    // report to stdout — capture it rather than treating exit != 0 as failure.
    return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || '') }
  }
}

function rel(p) {
  if (!p) return p
  return p.startsWith(CWD) ? p.slice(CWD.length + 1) : p
}

function normMsg(m) {
  return String(m).replace(/[0-9]+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200)
}

// Stable across scans: excludes line numbers so an edit above the issue doesn't
// re-fingerprint it, which keeps dismissals sticky.
function fingerprint(file, rule, message) {
  return createHash('sha256').update(REPO + '|' + rel(file) + '|' + rule + '|' + normMsg(message)).digest('hex').slice(0, 32)
}

const findings = []
function add(f) { if (findings.length < MAX_FINDINGS) findings.push(f) }

function runTsc() {
  const bin = localBin('tsc')
  if (!bin || !existsSync('tsconfig.json')) return
  const { out } = run(bin + ' --noEmit --pretty false')
  const re = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/
  for (const line of out.split('\n')) {
    const m = line.match(re)
    if (!m) continue
    const file = m[1]
    const ln = Number(m[2])
    const sev = m[4]
    const code = m[5]
    const message = m[6]
    add({
      layer: 'static',
      severity: sev === 'error' ? 'high' : 'low',
      confidence: 1,
      fingerprint: fingerprint(file, code, message),
      file_path: rel(file),
      line_start: ln,
      line_end: ln,
      title: code + ': ' + message.slice(0, 90),
      detail: message,
    })
  }
}

function runEslint() {
  const bin = localBin('eslint')
  if (!bin) return
  const { out } = run(bin + ' . -f json --no-error-on-unmatched-pattern')
  let report
  try { report = JSON.parse(out) } catch { return }
  if (!Array.isArray(report)) return
  for (const file of report) {
    for (const msg of (file.messages || [])) {
      const rule = msg.ruleId || 'eslint'
      const unused = /no-unused|unused-imports|no-unreachable/.test(rule)
      add({
        layer: 'static',
        severity: unused ? 'low' : (msg.severity === 2 ? 'medium' : 'low'),
        confidence: 1,
        fingerprint: fingerprint(file.filePath, rule, msg.message),
        file_path: rel(file.filePath),
        line_start: msg.line || null,
        line_end: msg.endLine || msg.line || null,
        title: rule + ': ' + String(msg.message).slice(0, 90),
        detail: msg.message,
      })
    }
  }
}

async function post(path, body) {
  try {
    const res = await fetch(CALLBACK.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      console.error('[enry-cruise] POST ' + path + ' -> ' + res.status + ' ' + t)
    }
    return res.ok
  } catch (e) {
    console.error('[enry-cruise] POST ' + path + ' threw: ' + (e && e.message || e))
    return false
  }
}

async function main() {
  await post('/api/cruise/ingest', { scan_id: SCAN_ID, phase: 'start', layer_status: { static: 'running' } })
  try {
    runTsc()
    runEslint()
    await post('/api/cruise/ingest', { scan_id: SCAN_ID, phase: 'findings', findings })
    await post('/api/cruise/ingest', {
      scan_id: SCAN_ID,
      phase: 'finalize',
      status: 'completed',
      layer_status: { static: 'done' },
      counts: { static: findings.length },
    })
    console.log('[enry-cruise] done: ' + findings.length + ' findings')
  } catch (e) {
    await post('/api/cruise/ingest', { scan_id: SCAN_ID, phase: 'finalize', status: 'failed', error: String(e && e.message || e) })
    process.exit(1)
  }
}

main()
