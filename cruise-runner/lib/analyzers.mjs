// Shared static-analysis helpers for the Cruise runners. Runs the checked-out
// repo's OWN tsc/eslint (never a bundled version) and returns findings in the
// shape /api/cruise/ingest expects. Used by both scan.mjs (report-only) and
// goal-run.mjs (validating an edit before it's committed).

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CWD = process.cwd()
const execAsync = promisify(exec)

// eslint's cache lives in the OS temp dir, never the repo tree — so it can't be
// committed and won't show in git status (which the runner reads to revert/
// commit). Within one goal run (one Actions job, one filesystem) the baseline
// pass warms it, then each step re-lints only the file(s) it changed: on a
// mid-size repo this took eslint from ~16s per pass to ~2s.
const ESLINT_CACHE = join(tmpdir(), 'enry-cruise-eslintcache')

function localBin(name) {
  const p = 'node_modules/.bin/' + name
  return existsSync(p) ? './' + p : null
}

async function run(cmd) {
  try {
    const { stdout } = await execAsync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return { code: 0, out: stdout }
  } catch (e) {
    // tsc / eslint exit non-zero when they find issues but still print the
    // report to stdout — capture it rather than treating exit != 0 as failure.
    return { code: e.code || 1, out: (e.stdout || '') + (e.stderr || '') }
  }
}

export function rel(p) {
  if (!p) return p
  return p.startsWith(CWD) ? p.slice(CWD.length + 1) : p
}

// Cruise commits its own runner into the repo (.enry-cruise/*, the two
// enry-cruise workflow files). Those aren't the app's code — linting them just
// reports the scanner on its own tooling (node: import-prefix nags, string
// literals from our own error messages). Excluded from every finding so both
// the report-only scan and goal-mode validation only ever see the app's source.
function isCruiseOwnFile(relPath) {
  const p = relPath || ''
  return p.startsWith('.enry-cruise/') || /(^|\/)enry-cruise(-goal)?\.yml$/.test(p)
}

function normMsg(m) {
  return String(m).replace(/[0-9]+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200)
}

// Stable across scans: excludes line numbers so an edit above the issue doesn't
// re-fingerprint it, which keeps dismissals sticky.
export function fingerprint(repo, file, rule, message) {
  return createHash('sha256').update(repo + '|' + rel(file) + '|' + rule + '|' + normMsg(message)).digest('hex').slice(0, 32)
}

// Strip JSONC comments + trailing commas so a tsconfig (which allows both) can
// be JSON.parsed.
function stripJsonc(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1')
}

// The tsconfig project(s) to actually type-check. Vite/Lovable/shadcn scaffolds
// use a references-only root tsconfig.json ({ "files": [], "references": [...] })
// whose real source lives in the referenced projects (tsconfig.app.json with
// include:["src"]). Running `tsc --noEmit` against that root checks ZERO files
// — a silent no-op that let real type errors (a wrong import, a bad export)
// sail straight through. Detect that shape and check each referenced project
// directly instead.
function tscProjects() {
  if (!existsSync('tsconfig.json')) return []
  let root
  try { root = JSON.parse(stripJsonc(readFileSync('tsconfig.json', 'utf8'))) } catch { return ['tsconfig.json'] }
  const refs = Array.isArray(root.references) ? root.references.map((r) => r && r.path).filter(Boolean) : []
  const rootChecksFiles = (Array.isArray(root.files) && root.files.length > 0) || root.include != null
  if (refs.length > 0 && !rootChecksFiles) {
    const existing = refs.filter((p) => existsSync(p))
    if (existing.length > 0) return existing
  }
  return ['tsconfig.json']
}

// Runs the repo's tsc across whichever project(s) actually hold the source, and
// returns parsed findings (deduped by fingerprint across projects). `repo` is
// used only for fingerprinting.
export async function runTsc(repo) {
  const bin = localBin('tsc')
  if (!bin) return []
  const projects = tscProjects()
  if (projects.length === 0) return []
  // Independent projects — check them concurrently. `-p <config>` for a specific
  // referenced project; bare `tsc --noEmit` reads tsconfig.json for the default.
  const outs = await Promise.all(projects.map((proj) =>
    run(bin + ' --noEmit --pretty false' + (proj === 'tsconfig.json' ? '' : ` -p ${proj}`)),
  ))
  const findings = []
  const seen = new Set()
  const re = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/
  for (const { out } of outs) {
    for (const line of out.split('\n')) {
      const m = line.match(re)
      if (!m) continue
      const file = m[1]
      if (isCruiseOwnFile(rel(file))) continue
      const code = m[5]
      const message = m[6]
      const fp = fingerprint(repo, file, code, message)
      if (seen.has(fp)) continue
      seen.add(fp)
      findings.push({
        layer: 'static',
        severity: m[4] === 'error' ? 'high' : 'low',
        confidence: 1,
        fingerprint: fp,
        file_path: rel(file),
        line_start: Number(m[2]),
        line_end: Number(m[2]),
        title: code + ': ' + message.slice(0, 90),
        detail: message,
      })
    }
  }
  return findings
}

// Runs eslint -f json and returns parsed findings.
export async function runEslint(repo) {
  const findings = []
  const bin = localBin('eslint')
  if (!bin) return findings
  const { out } = await run(bin + ' . -f json --no-error-on-unmatched-pattern --ignore-pattern ".enry-cruise/**" --cache --cache-location "' + ESLINT_CACHE + '"')
  let report
  try { report = JSON.parse(out) } catch { return findings }
  if (!Array.isArray(report)) return findings
  for (const file of report) {
    if (isCruiseOwnFile(rel(file.filePath))) continue
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
// tsc and eslint are independent — run them concurrently.
export async function blockingFindings(repo) {
  const [tsc, eslint] = await Promise.all([runTsc(repo), runEslint(repo)])
  return [...tsc.filter((f) => f.severity === 'high'), ...eslint.filter((f) => f.severity === 'medium')]
}

// All findings (both analyzers, every severity), for the report-only scan.
// Concurrent, same as blockingFindings.
export async function collectFindings(repo) {
  const [tsc, eslint] = await Promise.all([runTsc(repo), runEslint(repo)])
  return [...tsc, ...eslint]
}
