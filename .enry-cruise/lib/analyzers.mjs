// Shared static-analysis helpers for the Cruise runners. Runs the checked-out
// repo's OWN tsc/eslint (never a bundled version) and returns findings in the
// shape /api/cruise/ingest expects. Used by both scan.mjs (report-only) and
// goal-run.mjs (validating an edit before it's committed).

import { exec, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
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

// stdout only (never stderr), even on a non-zero exit. For tools whose stdout is
// structured (eslint -f json): node/eslint warnings on stderr must not pollute
// the parse. Bracket-containing warnings ([MODULE_TYPELESS_PACKAGE_JSON] …) make
// slicing the merged stream unreliable, so keep the streams separate.
async function runStdout(cmd) {
  try {
    const { stdout } = await execAsync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return stdout
  } catch (e) {
    return e.stdout || ''
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
  // stdout-only: eslint writes its JSON report there; node/eslint warnings go to
  // stderr and would otherwise break JSON.parse (dropping every finding silently).
  const out = await runStdout(bin + ' . -f json --no-error-on-unmatched-pattern --ignore-pattern ".enry-cruise/**" --cache --cache-location "' + ESLINT_CACHE + '"')
  let report
  try { report = JSON.parse(out) } catch { return findings }
  if (!Array.isArray(report)) return findings
  for (const file of report) {
    if (isCruiseOwnFile(rel(file.filePath))) continue
    for (const msg of (file.messages || [])) {
      const rule = msg.ruleId || 'eslint'
      const unused = /no-unused|unused-imports|no-unreachable/.test(rule)
      // Route each eslint message to a scan-and-fix category: unused code →
      // dead_code; anything eslint can auto-fix (--fix) → lint_autofix; the rest
      // stays an uncategorized static finding. hasFix drives lint_autofix.
      const hasFix = !!msg.fix
      const category = unused ? 'dead_code' : (hasFix ? 'lint_autofix' : null)
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
        category,
        hasFix,
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

// All findings for a scan, each tagged with `category` (null for uncategorized
// tsc/other lint). tsc + eslint always run; the extra category detectors run
// only for categories the caller enabled. `enabled` is a Set/array of category
// keys the repo hasn't turned off; when null, only tsc+eslint run (legacy).
export async function collectFindings(repo, enabled = null) {
  const on = enabled instanceof Set ? enabled : (Array.isArray(enabled) ? new Set(enabled) : null)
  const want = (c) => on === null || on.has(c)

  const [tsc, eslint] = await Promise.all([runTsc(repo), runEslint(repo)])
  const findings = [...tsc]
  for (const f of eslint) {
    // Drop a categorized eslint finding whose category the user turned off;
    // always keep uncategorized static findings (real type/other lint errors).
    if (f.category && on !== null && !on.has(f.category)) continue
    findings.push(f)
  }
  if (on === null) return findings

  // Graph-backed detectors (dead code / unused deps / broken imports) share one
  // module graph so it's built at most once per scan.
  const graph = (want('dead_code') || want('unused_deps') || want('broken_imports')) ? buildModuleGraph() : null

  const extra = await Promise.all([
    want('formatting') ? detectFormatting(repo) : Promise.resolve([]),
    want('debug_statements') ? Promise.resolve(detectDebugStatements(repo)) : Promise.resolve([]),
    want('non_functional_buttons') ? Promise.resolve(detectButtons(repo)) : Promise.resolve([]),
    want('unused_deps') ? Promise.resolve(detectUnusedDeps(repo, graph)) : Promise.resolve([]),
    want('broken_imports') ? Promise.resolve(detectBrokenImports(repo, graph)) : Promise.resolve([]),
    want('dead_code') ? Promise.resolve(detectOrphanedFiles(repo, graph)) : Promise.resolve([]),
  ])
  for (const arr of extra) for (const f of arr) findings.push(f)
  return findings
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan-and-fix categories: module graph + per-category detectors and the
// matching deterministic fixers. No LLM — every fixer is a tool invocation
// (prettier/eslint --fix) or a mechanical edit/removal. Node builtins only.
// ─────────────────────────────────────────────────────────────────────────────

const SRC_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const WALK_IGNORE = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  '.enry-cruise', '.github', '.turbo', '.cache', '.vercel', 'public',
])

// Every source file in the repo (relative paths, POSIX slashes), excluding
// build output, deps, and .d.ts declaration files.
function listSourceFiles() {
  const files = []
  const walk = (dir, depth) => {
    if (depth > 10) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.') || WALK_IGNORE.has(e.name)) continue
      const p = dir === '.' ? e.name : dir + '/' + e.name
      if (e.isDirectory()) walk(p, depth + 1)
      else if (SRC_EXTS.some((x) => e.name.endsWith(x)) && !e.name.endsWith('.d.ts')) files.push(p)
    }
  }
  walk('.', 0)
  return files
}

// Which line (1-based) a specifier first appears on — for finding locations.
function lineOf(content, needle) {
  const idx = content.indexOf(needle)
  return idx < 0 ? null : content.slice(0, idx).split('\n').length
}

// Import/require/export-from specifiers in a source file. Regex-based (no parser
// dependency); comments are stripped first so commented-out imports don't count.
function parseImports(content) {
  const src = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const specs = []
  const scan = (re) => { let m; while ((m = re.exec(src)) !== null) specs.push(m[1]) }
  scan(/(?:^|[\n;])\s*(?:import|export)\b[^'"\n]*?from\s*['"]([^'"]+)['"]/g) // import/export … from 'x'
  scan(/(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g)                            // side-effect import 'x'
  scan(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)                               // require('x')
  scan(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)                                // dynamic import('x')
  return specs
}

// The npm package a bare specifier belongs to ('@scope/pkg/sub' -> '@scope/pkg',
// 'pkg/sub' -> 'pkg').
function topPkg(spec) {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/')
  return spec.split('/')[0]
}

// tsconfig path aliases -> [{ prefix, targets }] (e.g. '@/' -> ['src/']). Lets
// the graph resolve alias imports the way the repo's bundler does.
function loadAliases() {
  const aliases = []
  for (const tc of ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.base.json']) {
    if (!existsSync(tc)) continue
    let cfg
    try { cfg = JSON.parse(stripJsonc(readFileSync(tc, 'utf8'))) } catch { continue }
    const co = cfg.compilerOptions || {}
    const baseUrl = (co.baseUrl || '.').replace(/^\.\//, '')
    for (const [k, v] of Object.entries(co.paths || {})) {
      if (!Array.isArray(v)) continue
      const prefix = k.replace(/\*$/, '')
      const targets = v.map((t) => cleanRel((baseUrl === '.' ? '' : baseUrl + '/') + String(t).replace(/^\.\//, '').replace(/\*$/, '')))
      aliases.push({ prefix, targets })
    }
  }
  return aliases
}

const cleanRel = (p) => p.replace(/^\.\//, '').replace(/\/{2,}/g, '/')

// POSIX path join that resolves '.' and '..' segments.
function posixJoin(dir, spec) {
  const parts = (dir === '.' || dir === '' ? [] : dir.split('/')).concat(spec.split('/'))
  const out = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

// Resolve an import target to a repo file, trying extensions and /index.
function tryResolve(base, fileSet) {
  if (fileSet.has(base)) return base
  for (const ext of SRC_EXTS) if (fileSet.has(base + ext)) return base + ext
  for (const ext of SRC_EXTS) if (fileSet.has(base + '/index' + ext)) return base + '/index' + ext
  if (existsSync(base)) return base // .css/.json/.svg and other assets that exist on disk
  return null
}

// Classify + resolve one specifier. type: 'relative' | 'alias' | 'external'.
function resolveImport(spec, fromFile, aliases, fileSet) {
  if (spec.startsWith('.')) {
    const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '.'
    return { type: 'relative', resolved: tryResolve(cleanRel(posixJoin(dir, spec)), fileSet) }
  }
  for (const a of aliases) {
    if (spec === a.prefix.replace(/\/$/, '') || spec.startsWith(a.prefix)) {
      const rest = spec.slice(a.prefix.length)
      for (const t of a.targets) {
        const r = tryResolve(cleanRel(t + rest), fileSet)
        if (r) return { type: 'alias', resolved: r }
      }
      return { type: 'alias', resolved: null }
    }
  }
  return { type: 'external', resolved: null }
}

// The module graph: which files import which, which packages are imported, and
// which relative/alias imports fail to resolve (broken). Shared by dead_code,
// unused_deps and broken_imports.
export function buildModuleGraph() {
  const files = listSourceFiles()
  const fileSet = new Set(files)
  const aliases = loadAliases()
  const importedBy = new Map() // resolved path -> Set of importer paths
  const packagesUsed = new Set()
  const broken = []            // { file, spec, line }
  for (const f of files) {
    if (isCruiseOwnFile(f)) continue
    let content
    try { content = readFileSync(f, 'utf8') } catch { continue }
    for (const spec of parseImports(content)) {
      const r = resolveImport(spec, f, aliases, fileSet)
      if (r.type === 'external') {
        if (!spec.startsWith('node:')) packagesUsed.add(topPkg(spec))
      } else if (r.resolved) {
        if (!importedBy.has(r.resolved)) importedBy.set(r.resolved, new Set())
        importedBy.get(r.resolved).add(f)
      } else {
        broken.push({ file: f, spec, line: lineOf(content, spec) })
      }
    }
  }
  return { files, fileSet, aliases, importedBy, packagesUsed, broken }
}

// A category finding in the shape /api/cruise/ingest expects. Fingerprint keys
// on the (normalized) detail so multiple distinct occurrences in one file stay
// separate findings while identical ones dedupe.
function mkFinding(repo, file, rule, title, line, severity, category, detail) {
  return {
    layer: 'static',
    severity,
    confidence: 1,
    fingerprint: fingerprint(repo, file, rule, detail || title),
    file_path: rel(file),
    line_start: line || null,
    line_end: line || null,
    title,
    detail: detail || title,
    category,
  }
}

// ── Detectors ────────────────────────────────────────────────────────────────

// Formatting: files the repo's own prettier would rewrite. No prettier -> the
// category is simply unavailable (no findings, no error).
export async function detectFormatting(repo) {
  const bin = localBin('prettier')
  if (!bin) return []
  const { out } = await run(bin + ' . -l')
  const findings = []
  for (const line of out.split('\n')) {
    const p = line.trim()
    if (!p || p.startsWith('[') || !existsSync(p) || isCruiseOwnFile(p)) continue
    findings.push(mkFinding(repo, p, 'prettier', 'Not formatted to the repo prettier config', null, 'low', 'formatting', 'prettier would reformat this file'))
  }
  return findings
}

// A console.log/debug or debugger statement that is the whole line (safe to
// remove mechanically). Inline/multi-line calls are reported but not the target
// of a mechanical fix.
function debugKind(trimmed) {
  if (/^debugger\s*;?$/.test(trimmed)) return { kind: 'debugger statement', removable: true }
  const cm = trimmed.match(/^console\.(log|debug)\s*\(/)
  if (cm) return { kind: `console.${cm[1]} call`, removable: /\)\s*;?\s*$/.test(trimmed) }
  if (/\/\/\s*(TODO|FIXME)\b.*\bremove\b/i.test(trimmed)) return { kind: 'stale remove-marker comment', removable: false }
  return null
}

export function detectDebugStatements(repo) {
  const findings = []
  for (const f of listSourceFiles()) {
    if (isCruiseOwnFile(f)) continue
    let lines
    try { lines = readFileSync(f, 'utf8').split('\n') } catch { continue }
    lines.forEach((line, i) => {
      const k = debugKind(line.trim())
      if (k) findings.push(mkFinding(repo, f, 'debug', `Leftover ${k.kind}`, i + 1, 'low', 'debug_statements', line.trim().slice(0, 120)))
    })
  }
  return findings
}

// A <button> (or role="button") whose opening tag carries no onClick, or an
// empty one. `=>` is allowed inside the tag so arrow-fn handlers aren't cut off.
export function detectButtons(repo) {
  const findings = []
  for (const f of listSourceFiles()) {
    if (!/\.(tsx|jsx)$/.test(f) || isCruiseOwnFile(f)) continue
    let content
    try { content = readFileSync(f, 'utf8') } catch { continue }
    const re = /<button\b((?:=>|[^>])*)>/g
    let m
    while ((m = re.exec(content)) !== null) {
      const attrs = m[1]
      const hasClick = /\bonClick\s*=/.test(attrs)
      const emptyClick = /\bonClick\s*=\s*\{\s*(?:undefined\s*)?\}/.test(attrs) || /\bonClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(attrs)
      if (hasClick && !emptyClick) continue
      const line = content.slice(0, m.index).split('\n').length
      findings.push(mkFinding(repo, f, 'button', emptyClick ? 'Button with an empty onClick handler' : 'Button has no onClick handler', line, 'low', 'non_functional_buttons', m[0].replace(/\s+/g, ' ').slice(0, 120)))
    }
  }
  return findings
}

// Packages we never auto-flag as unused: they're used via config/CLI, not an
// import statement, so an import scan can't see them.
const IMPLICIT_DEP = [
  /^@types\//, /eslint/, /prettier/, /^typescript$/, /^vite$/, /^@vitejs\//,
  /tailwindcss/, /^@tailwindcss\//, /^postcss/, /^autoprefixer$/, /-config$/,
  /^husky$/, /^lint-staged$/, /^rimraf$/, /^cross-env$/, /^npm-run-all$/, /^concurrently$/,
]

// Read + textually scan every source file once, so a dep referenced only as a
// string (a plugin named in a config) still counts as used.
function repoTextBlob() {
  let blob = ''
  for (const f of listSourceFiles()) {
    try { blob += '\n' + readFileSync(f, 'utf8') } catch { /* skip */ }
  }
  return blob
}

// package.json deps never imported anywhere. Conservative: skips build/config
// tooling and anything referenced textually (scripts or a config string). The
// npm build gate can't catch a wrong removal here (node_modules stays intact),
// so the bar for "unused" is deliberately high.
export function detectUnusedDeps(repo, graph) {
  if (!existsSync('package.json')) return []
  let pkg
  try { pkg = JSON.parse(readFileSync('package.json', 'utf8')) } catch { return [] }
  const used = (graph || buildModuleGraph()).packagesUsed
  const scriptsBlob = JSON.stringify(pkg.scripts || {})
  const textBlob = repoTextBlob()
  const findings = []
  const consider = (obj, dev) => {
    for (const name of Object.keys(obj || {})) {
      if (used.has(name) || IMPLICIT_DEP.some((re) => re.test(name))) continue
      if (scriptsBlob.includes(name) || textBlob.includes(name)) continue
      findings.push(mkFinding(repo, 'package.json', 'unused-dep', `Unused dependency: ${name}`, null, 'low', 'unused_deps', `"${name}" is in ${dev ? 'devDependencies' : 'dependencies'} but never imported or referenced.`))
    }
  }
  consider(pkg.dependencies, false)
  consider(pkg.devDependencies, true)
  return findings
}

// Relative/alias imports whose target file doesn't exist.
export function detectBrokenImports(repo, graph) {
  const g = graph || buildModuleGraph()
  return g.broken.map((b) =>
    mkFinding(repo, b.file, 'broken-import', `Broken import: '${b.spec}'`, b.line, 'high', 'broken_imports', `'${b.spec}' does not resolve to a file in the repo.`))
}

// Files at repo root or matching a framework-entry / config / test convention:
// legitimately un-imported, so never flag them as orphaned.
function isEntryFile(f) {
  const base = f.split('/').pop()
  if (!f.includes('/')) return true // repo-root scripts/configs
  if (/\.(config|setup|test|spec|stories|d)\.[cm]?[jt]sx?$/.test(base)) return true
  if (/^(main|index|app|vite-env|service-worker|sw|registerServiceWorker)\.[cm]?[jt]sx?$/i.test(base)) return true
  if (/(^|\/)(pages|app|src\/pages|src\/app|__tests__|__mocks__)\//.test(f)) return true // file-based routing / tests
  return false
}

// Source files nothing imports (and that aren't entry points). Auto-fix deletes
// them; the tsc/build gate reverts the deletion if anything actually used it.
export function detectOrphanedFiles(repo, graph) {
  const g = graph || buildModuleGraph()
  const findings = []
  for (const f of g.files) {
    if (isCruiseOwnFile(f) || isEntryFile(f) || g.importedBy.has(f)) continue
    findings.push(mkFinding(repo, f, 'orphan-file', `Orphaned file: ${f}`, null, 'low', 'dead_code', `No source file imports ${f}. Candidate for removal.`))
  }
  return findings
}

// ── Deterministic fixers ─────────────────────────────────────────────────────
// Each mutates the working tree in place and returns a one-line note. The
// scanfix runner detects the resulting git delta, validates it against the
// tsc/eslint baseline + build, and commits (or reverts) — so a fixer only has
// to make the change; correctness is enforced by the same gate the goal loop uses.

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) { return ((e && e.stdout) || '') + ((e && e.stderr) || '') }
}

export function fixFormatting() {
  const bin = localBin('prettier')
  if (!bin) return { note: 'prettier not installed — skipped' }
  sh(bin + ' . -w --log-level warn')
  return { note: 'ran prettier --write' }
}

export function fixLint() {
  const bin = localBin('eslint')
  if (!bin) return { note: 'eslint not installed — skipped' }
  sh(bin + ' . --fix --no-error-on-unmatched-pattern --ignore-pattern ".enry-cruise/**"')
  return { note: 'ran eslint --fix' }
}

export function fixDeadCode(repo, graph) {
  const bin = localBin('eslint')
  if (bin) sh(bin + ' . --fix --no-error-on-unmatched-pattern --ignore-pattern ".enry-cruise/**"')
  let removed = 0
  for (const f of detectOrphanedFiles(repo, graph)) {
    try { rmSync(f.file_path, { force: true }); removed++ } catch { /* best effort */ }
  }
  return { note: `eslint --fix${removed ? ` + deleted ${removed} orphaned file(s)` : ''}` }
}

export function fixDebugStatements(repo) {
  const byFile = new Map()
  for (const fnd of detectDebugStatements(repo)) {
    if (!byFile.has(fnd.file_path)) byFile.set(fnd.file_path, true)
  }
  let count = 0
  for (const file of byFile.keys()) {
    let lines
    try { lines = readFileSync(file, 'utf8').split('\n') } catch { continue }
    const kept = lines.filter((line) => {
      const k = debugKind(line.trim())
      if (k && k.removable) { count++; return false }
      return true
    })
    if (kept.length !== lines.length) {
      try { writeFileSync(file, kept.join('\n'), 'utf8') } catch { /* best effort */ }
    }
  }
  return { note: count ? `removed ${count} debug statement(s)` : 'no removable debug statements' }
}

export function fixUnusedDeps(repo, graph) {
  const names = detectUnusedDeps(repo, graph).map((f) => f.title.replace('Unused dependency: ', ''))
  if (names.length === 0) return { note: 'no unused dependencies' }
  let pkg, raw
  try { raw = readFileSync('package.json', 'utf8'); pkg = JSON.parse(raw) } catch { return { note: 'could not read package.json' } }
  let removed = 0
  for (const n of names) {
    if (pkg.dependencies && n in pkg.dependencies) { delete pkg.dependencies[n]; removed++ }
    if (pkg.devDependencies && n in pkg.devDependencies) { delete pkg.devDependencies[n]; removed++ }
  }
  if (removed > 0) {
    const indent = raw.match(/\n(\s+)"/)?.[1]?.length || 2
    writeFileSync('package.json', JSON.stringify(pkg, null, indent) + '\n', 'utf8')
  }
  return { note: `removed ${removed} unused dependency/ies` }
}

// Relative path from one file's directory to a target file, without extension.
function relativeSpec(fromFile, toFile) {
  const fromDir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')).split('/') : []
  const to = toFile.replace(/\.[cm]?[jt]sx?$/, '').replace(/\/index$/, '').split('/')
  let i = 0
  while (i < fromDir.length && i < to.length && fromDir[i] === to[i]) i++
  const up = fromDir.slice(i).map(() => '..')
  const down = to.slice(i)
  const parts = up.concat(down)
  const spec = parts.join('/')
  return spec.startsWith('.') ? spec : './' + spec
}

export function fixBrokenImports(repo, graph) {
  const g = graph || buildModuleGraph()
  // basename (no ext) -> [files], for unique-match repathing.
  const byBase = new Map()
  for (const f of g.files) {
    const base = f.split('/').pop().replace(/\.[cm]?[jt]sx?$/, '')
    if (!byBase.has(base)) byBase.set(base, [])
    byBase.get(base).push(f)
  }
  let fixed = 0
  const edits = new Map() // file -> content
  for (const b of g.broken) {
    const base = b.spec.split('/').pop().replace(/\.[cm]?[jt]sx?$/, '')
    const candidates = (byBase.get(base) || []).filter((c) => c !== b.file)
    if (candidates.length !== 1) continue // ambiguous or none -> leave it (reported)
    const newSpec = relativeSpec(b.file, candidates[0])
    let content = edits.get(b.file) ?? (() => { try { return readFileSync(b.file, 'utf8') } catch { return null } })()
    if (content == null) continue
    const next = content.split(`'${b.spec}'`).join(`'${newSpec}'`).split(`"${b.spec}"`).join(`"${newSpec}"`)
    if (next !== content) { edits.set(b.file, next); fixed++ }
  }
  for (const [file, content] of edits) {
    try { writeFileSync(file, content, 'utf8') } catch { /* best effort */ }
  }
  return { note: fixed ? `repathed ${fixed} broken import(s)` : 'no unambiguously-fixable broken imports' }
}

// Opt-in only. Inserts a TODO comment above a non-functional button, but only
// when the tag sits cleanly at the start of its own line (safe JSX child spot) —
// never guesses a handler.
export function fixButtons(repo) {
  const findings = detectButtons(repo)
  const byFile = new Map()
  for (const f of findings) {
    if (!byFile.has(f.file_path)) byFile.set(f.file_path, [])
    byFile.get(f.file_path).push(f.line_start)
  }
  let count = 0
  for (const [file, lines] of byFile) {
    let src
    try { src = readFileSync(file, 'utf8').split('\n') } catch { continue }
    const targets = new Set(lines)
    const out = []
    src.forEach((line, i) => {
      const n = i + 1
      if (targets.has(n) && /^\s*<button\b/.test(line) && !/wire up onClick/.test(src[i - 1] || '')) {
        const indent = line.match(/^\s*/)[0]
        out.push(`${indent}{/* TODO: wire up onClick handler for this button */}`)
        count++
      }
      out.push(line)
    })
    if (count) { try { writeFileSync(file, out.join('\n'), 'utf8') } catch { /* best effort */ } }
  }
  return { note: count ? `flagged ${count} button(s) with a TODO` : 'no cleanly-flaggable buttons' }
}

// Category -> its fixer, for the scanfix runner. dead_code/unused_deps/
// broken_imports take the shared graph; the tool fixers ignore extra args.
export const CATEGORY_FIXERS = {
  formatting: (repo, graph) => fixFormatting(),
  lint_autofix: (repo, graph) => fixLint(),
  dead_code: (repo, graph) => fixDeadCode(repo, graph),
  debug_statements: (repo, graph) => fixDebugStatements(repo),
  unused_deps: (repo, graph) => fixUnusedDeps(repo, graph),
  broken_imports: (repo, graph) => fixBrokenImports(repo, graph),
  non_functional_buttons: (repo, graph) => fixButtons(repo),
}
