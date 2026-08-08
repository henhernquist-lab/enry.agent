// Batch 3.5 — cheap repo grounding for the Planner.
//
// Batch 3 shipped with the Planner seeing only {repo, goal}. Verified live, it
// decomposed a goal into Spring Boot tasks — application.properties, @WebMvcTest
// — for a Next.js/TypeScript repo. Not a wiring bug: the model had nothing to go
// on and guessed. This is the smallest thing that would have prevented that.
//
// Deliberately shallow. No file contents beyond a manifest and a README head, no
// recursion past two levels, no embeddings, and no second model call to
// summarise — the whole point is that grounding must cost less than the mistake
// it prevents. Everything here is one shell command through runHeadless, the
// same exec path runBuilderTask and detectClis use.

import { runHeadless, base64Arg } from '@/lib/terminal/headless-run'

/**
 * Ceiling on the rendered context, in characters.
 *
 * This is spent from the same per-mission token budget as the planning itself,
 * so it is a hard truncation rather than a target: roughly 1k tokens against a
 * 60k default cap. Big enough for a dependency list, small enough that context
 * alone can never approach the cap.
 */
export const MAX_CONTEXT_CHARS = 4000

/** Per-section caps, applied before the overall one. */
const MAX_MANIFEST_BYTES = 6000
const MAX_README_CHARS = 700
const MAX_DIR_ENTRIES = 40
const MAX_DEPS = 40

const CONTEXT_TIMEOUT_MS = 45_000

/** Manifests worth reading, most specific first. */
const MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'composer.json',
  'Gemfile',
  'pom.xml',
  'build.gradle',
]

const SECTION = {
  manifest: '===GOLEM_MANIFEST===',
  dirs: '===GOLEM_DIRS===',
  readme: '===GOLEM_README===',
  end: '===GOLEM_END===',
}

function gatherScript(): string {
  return `
set +e
for f in ${MANIFESTS.join(' ')}; do
  if [ -f "$f" ]; then
    echo "${SECTION.manifest}"
    echo "$f"
    head -c ${MAX_MANIFEST_BYTES} "$f"
    echo
    break
  fi
done
echo "${SECTION.dirs}"
ls -A 2>/dev/null | head -${MAX_DIR_ENTRIES}
for d in */ src/*/ app/*/; do
  [ -d "$d" ] || continue
  echo "$d"
done 2>/dev/null | head -${MAX_DIR_ENTRIES}
echo "${SECTION.readme}"
for r in README.md readme.md README; do
  [ -f "$r" ] && head -c ${MAX_README_CHARS} "$r" && break
done
echo
echo "${SECTION.end}"
`.trim()
}

function section(raw: string, start: string, end: string): string {
  const from = raw.indexOf(start)
  if (from === -1) return ''
  const body = raw.slice(from + start.length)
  const to = body.indexOf(end)
  return (to === -1 ? body : body.slice(0, to)).trim()
}

interface PackageJson {
  name?: string
  description?: string
  packageManager?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

/**
 * Render a package.json down to the parts that decide how work is planned.
 *
 * The raw file is mostly noise for this purpose — versions, lockfile hints,
 * config blocks. What changes a plan is which framework and test runner are
 * present, so only names are kept, and only the first MAX_DEPS of them.
 */
function renderPackageJson(text: string): string | null {
  let pkg: PackageJson
  try {
    pkg = JSON.parse(text) as PackageJson
  } catch {
    return null
  }
  const names = (record?: Record<string, string>) => Object.keys(record ?? {})
  const deps = names(pkg.dependencies)
  const devDeps = names(pkg.devDependencies)
  const scripts = Object.entries(pkg.scripts ?? {}).map(([k, v]) => `${k}: ${v}`)

  const lines = [`name: ${pkg.name ?? '(unnamed)'}`]
  if (pkg.description) lines.push(`description: ${pkg.description}`)
  if (pkg.packageManager) lines.push(`packageManager: ${pkg.packageManager}`)
  if (deps.length) lines.push(`dependencies (${deps.length}): ${deps.slice(0, MAX_DEPS).join(', ')}`)
  if (devDeps.length) lines.push(`devDependencies (${devDeps.length}): ${devDeps.slice(0, MAX_DEPS).join(', ')}`)
  if (scripts.length) lines.push(`scripts:\n  ${scripts.slice(0, 15).join('\n  ')}`)
  return lines.join('\n')
}

export interface RepoContext {
  /** Rendered block for the prompt. Empty when nothing could be gathered. */
  text: string
  manifestFile: string | null
  /** True when the raw gather exceeded a cap and was cut. */
  truncated: boolean
  /** Why nothing was gathered, when that happened. Never throws. */
  warning: string | null
  chars: number
}

const EMPTY: RepoContext = { text: '', manifestFile: null, truncated: false, warning: null, chars: 0 }

/**
 * Read cheap grounding facts about a repo checkout.
 *
 * Never throws: planning without context is worse than planning with it, but it
 * is far better than not planning at all. A failure downgrades to an empty
 * context with the reason attached, and the Planner notes it in its event.
 */
export async function gatherRepoContext(options: { cwd?: string } = {}): Promise<RepoContext> {
  let run
  try {
    run = await runHeadless(`bash -c ${base64Arg(gatherScript())}`, {
      timeoutMs: CONTEXT_TIMEOUT_MS,
      runId: `ctx-${Date.now()}`,
      cwd: options.cwd,
    })
  } catch (err) {
    return { ...EMPTY, warning: `repo context unavailable: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (run.failure || run.timedOut) {
    return { ...EMPTY, warning: `repo context unavailable: ${run.failure ?? 'timed out'}` }
  }

  const raw = run.output
  const manifestBlock = section(raw, SECTION.manifest, SECTION.dirs)
  const newline = manifestBlock.indexOf('\n')
  const manifestFile = newline === -1 ? null : manifestBlock.slice(0, newline).trim()
  const manifestBody = newline === -1 ? '' : manifestBlock.slice(newline + 1).trim()

  const dirs = section(raw, SECTION.dirs, SECTION.readme)
  const readme = section(raw, SECTION.readme, SECTION.end)

  const parts: string[] = []
  if (manifestFile && manifestBody) {
    const rendered = manifestFile === 'package.json' ? renderPackageJson(manifestBody) : null
    parts.push(`--- ${manifestFile} ---\n${rendered ?? manifestBody.slice(0, 1200)}`)
  }
  if (dirs) {
    const entries = [...new Set(dirs.split('\n').map((d) => d.trim()).filter(Boolean))]
    parts.push(`--- top-level layout ---\n${entries.slice(0, MAX_DIR_ENTRIES).join(' ')}`)
  }
  if (readme) parts.push(`--- README (excerpt) ---\n${readme}`)

  if (parts.length === 0) {
    return { ...EMPTY, warning: 'repo context empty — no manifest, layout or README found' }
  }

  const joined = parts.join('\n\n')
  const truncated = joined.length > MAX_CONTEXT_CHARS
  const text = truncated ? `${joined.slice(0, MAX_CONTEXT_CHARS)}\n[context truncated]` : joined

  return { text, manifestFile, truncated, warning: null, chars: text.length }
}
