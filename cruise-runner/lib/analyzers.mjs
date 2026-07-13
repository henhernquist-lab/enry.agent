// Shared static-analysis helpers for the Cruise runners. Runs the checked-out
// repo's OWN tsc/eslint (never a bundled version) and returns findings in the
// shape /api/cruise/ingest expects. Used by both scan.mjs (report-only) and
// goal-run.mjs (validating an edit before it's committed).

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'

const CWD = process.cwd()

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

export function rel(p) {
  if (!p) return p
  return p.startsWith(CWD) ? p.slice(CWD.length + 1) : p
}

function normMsg(m) {
  return String(m).replace(/[0-9]+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200)
}

// Stable across scans: excludes line numbers so an edit above the issue doesn't
// re-fingerprint it, which keeps dismissals sticky.
export function fingerprint(repo, file, rule, message) {
  return createHash('sha256').update(repo + '|' + rel(file) + '|' + rule + '|' + normMsg(message)).digest('hex').slice(0, 32)
}

// Runs tsc --noEmit and returns parsed findings. `repo` is used only for
// fingerprinting; pass '' if the caller doesn't need stable fingerprints
// (e.g. goal-run's pass/fail validation, which only cares about the count).
export function runTsc(repo) {
  const findings = []
  const bin = localBin('tsc')
  if (!bin || !existsSync('tsconfig.json')) return findings
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
    findings.push({
      layer: 'static',
      severity: sev === 'error' ? 'high' : 'low',
      confidence: 1,
      fingerprint: fingerprint(repo, file, code, message),
      file_path: rel(file),
      line_start: ln,
      line_end: ln,
      title: code + ': ' + message.slice(0, 90),
      detail: message,
    })
  }
  return findings
}

// Runs eslint -f json and returns parsed findings.
export function runEslint(repo) {
  const findings = []
  const bin = localBin('eslint')
  if (!bin) return findings
  const { out } = run(bin + ' . -f json --no-error-on-unmatched-pattern')
  let report
  try { report = JSON.parse(out) } catch { return findings }
  if (!Array.isArray(report)) return findings
  for (const file of report) {
    for (const msg of (file.messages || [])) {
      const rule = msg.ruleId || 'eslint'
      const unused = /no-unused|unused-imports|no-unreachable/.test(rule)
      findings.push({
        layer: 'static',
        severity: unused ? 'low' : (msg.severity === 2 ? 'medium' : 'low'),
        confidence: 1,
        fingerprint: fingerprint(repo, file.filePath, rule, msg.message),
        file_path: rel(file.filePath),
        line_start: msg.line || null,
        line_end: msg.endLine || msg.line || null,
        title: rule + ': ' + String(msg.message).slice(0, 90),
        detail: msg.message,
      })
    }
  }
  return findings
}

// The findings that matter for a goal-run pass/fail gate: tsc errors (severity
// 'high') + eslint errors (severity 'medium'). Warnings / low-severity lint
// don't block a commit. Returns the actual findings — not just a count — so
// goal-run.mjs can diff them by fingerprint against a baseline (to isolate the
// errors a specific edit newly introduced) and report the real messages.
export function blockingFindings(repo) {
  return [
    ...runTsc(repo).filter((f) => f.severity === 'high'),
    ...runEslint(repo).filter((f) => f.severity === 'medium'),
  ]
}
