// Discover which CLIs actually exist on the machine the builders run on, and
// reconcile that against the layer-2 rows in `agents`.
//
// Why this exists: agents rows are seed data. Nothing had ever confirmed that
// Codex, Crush, OpenHands or Freebuff are installed anywhere, so the dispatcher
// could hand a task to an agent whose binary does not exist. Meanwhile CLIs
// installed by hand in the terminal were invisible to the system entirely.
//
// Detection runs through runHeadless, so it uses the same exec path as the
// builder adapter — whatever host that resolves to is the host these results
// describe. That distinction is load-bearing: a CLI present in the Codespace
// says nothing about the Fly Sprite, which is why every result records the
// backend it came from.

import { runHeadless, base64Arg, type BackendKind } from '@/lib/terminal/headless-run'
import { listAgents } from './store'
import type { Agent } from './types'

export const DETECT_TIMEOUT_MS = 90_000

/** Directories where hand-installed CLIs land. System dirs are excluded on
 *  purpose — /usr/bin is thousands of coreutils, not candidate builders. */
const SCAN_DIRS = [
  '$HOME/.local/bin',
  '$HOME/.bun/bin',
  '$HOME/.cargo/bin',
  '$HOME/go/bin',
  '$HOME/.deno/bin',
  '/usr/local/bin',
  '$(npm prefix -g 2>/dev/null)/bin',
  '$(command -v node >/dev/null && dirname "$(command -v node)")',
]

/** Cap on scanned entries. A misconfigured PATH dir should not produce a
 *  thousand-row report; truncation is reported rather than hidden. */
const MAX_SCAN_ENTRIES = 300

export interface DetectedBinary {
  name: string
  path: string
  version: string | null
  /** True when found via `command -v` for a name already in `agents`. */
  fromAgentsTable: boolean
}

/** A globally installed package — something someone chose to install. */
export interface InstalledPackage {
  manager: 'npm' | 'pipx'
  name: string
  version: string
}

export interface AgentDetection {
  agent: Agent
  /** The executable from cli_command, with any flags stripped. */
  executable: string
  installed: boolean
  path: string | null
  version: string | null
}

export interface CliDetectionReport {
  host: BackendKind
  detectedAt: string
  /** Every layer-2 row, marked confirmed or unconfirmed. */
  agents: AgentDetection[]
  /** Executables found in user-install locations. */
  discovered: DetectedBinary[]
  /** Discovered binaries with no matching agents row — reconciliation candidates. */
  candidates: DetectedBinary[]
  /** Global npm/pipx packages, the highest-signal view of what was installed by hand. */
  packages: InstalledPackage[]
  truncated: boolean
  /** Non-fatal problems (timeout, non-zero exit) with the raw tail for triage. */
  warning: string | null
  raw: string
}

/** `cli_command` may carry flags ("gemini --skip-trust"); probe the binary only. */
export function executableOf(cliCommand: string): string {
  return cliCommand.trim().split(/\s+/)[0] ?? ''
}

/**
 * The detection script.
 *
 * Emitted as tab-separated records rather than pretty output so parsing is not
 * a screen-scrape. `timeout` guards every --version call: an unknown binary may
 * ignore the flag and sit waiting on stdin, which would hang the whole run.
 */
function detectionScript(names: string[]): string {
  const quoted = names.map((n) => `'${n.replaceAll("'", "'\\''")}'`).join(' ')
  return `
set +e
ver() {
  if command -v timeout >/dev/null 2>&1; then
    timeout 5 "$1" --version 2>/dev/null </dev/null | head -1 | tr -d '\\r'
  fi
}
echo "HOST\t$(uname -s)\t$(uname -m)\t$(hostname 2>/dev/null)"
for n in ${quoted}; do
  p=$(command -v "$n" 2>/dev/null)
  if [ -n "$p" ]; then printf 'AGENT\\t%s\\t%s\\t%s\\n' "$n" "$p" "$(ver "$n")"
  else printf 'AGENT\\t%s\\t\\t\\n' "$n"; fi
done
# Scan set: the well-known install locations PLUS every PATH entry under $HOME
# or /usr/local. Hardcoding was not enough — nvm puts the active node version's
# bin on PATH at a path no fixed list predicts, and that is exactly where the
# AI CLIs live.
dirs=$(printf '%s\n%s' "${SCAN_DIRS.join('\\n')}" "$(printf '%s' "$PATH" | tr ':' '\n')" \
  | grep -E "^($HOME|/usr/local)" | sort -u)
for d in $dirs; do
  [ -d "$d" ] || continue
  for f in "$d"/*; do
    [ -x "$f" ] && [ ! -d "$f" ] || continue
    printf 'SCAN\\t%s\\t%s\\n' "$(basename "$f")" "$f"
  done
done
# Package-manager globals: things someone chose to install, not shims and
# coreutils that came with the image.
#
# 'npm ls -g' alone is not enough — under nvm it reports "(empty)" from npm's
# own prefix while claude and gemini sit in the active version's tree. Walk the
# node_modules beside each bin directory too.
if command -v npm >/dev/null 2>&1; then
  timeout 25 npm ls -g --depth=0 2>/dev/null | sed -n 's/^[^ ]* \\(.*\\)@\\([^@]*\\)$/NPM\\t\\1\\t\\2/p'
fi
for d in $dirs; do
  nm="$d/../lib/node_modules"
  [ -d "$nm" ] || continue
  for pkg in "$nm"/* "$nm"/@*/*; do
    [ -f "$pkg/package.json" ] || continue
    v=$(sed -n 's/.*"version": *"\\([^"]*\\)".*/\\1/p' "$pkg/package.json" | head -1)
    printf 'NPM\\t%s\\t%s\\n' "$(echo "$pkg" | sed "s|^$nm/||")" "$v"
  done
done
if command -v pipx >/dev/null 2>&1; then
  timeout 25 pipx list --short 2>/dev/null | sed -n 's/^\\([^ ]*\\) \\(.*\\)$/PIPX\\t\\1\\t\\2/p'
fi
`.trim()
}

interface ParsedLines {
  agents: Map<string, { path: string; version: string | null }>
  scan: Map<string, string>
  packages: InstalledPackage[]
  truncated: boolean
}

function parseDetection(output: string): ParsedLines {
  const agents = new Map<string, { path: string; version: string | null }>()
  const scan = new Map<string, string>()
  const packages: InstalledPackage[] = []
  let scanned = 0
  let truncated = false

  for (const line of output.split('\n')) {
    const parts = line.split('\t')
    if (parts[0] === 'AGENT' && parts[1]) {
      const path = (parts[2] ?? '').trim()
      if (path) agents.set(parts[1], { path, version: (parts[3] ?? '').trim() || null })
    } else if ((parts[0] === 'NPM' || parts[0] === 'PIPX') && parts[1]) {
      const manager = parts[0] === 'NPM' ? 'npm' : 'pipx'
      const name = parts[1].trim()
      // Several scanned bin dirs can resolve to the same node_modules tree.
      if (!packages.some((x) => x.manager === manager && x.name === name)) {
        packages.push({ manager, name, version: (parts[2] ?? '').trim() })
      }
    } else if (parts[0] === 'SCAN' && parts[1] && parts[2]) {
      if (scanned >= MAX_SCAN_ENTRIES) {
        truncated = true
        continue
      }
      // First win: SCAN_DIRS is ordered by precedence, matching PATH intent.
      if (!scan.has(parts[1])) {
        scan.set(parts[1], parts[2].trim())
        scanned++
      }
    }
  }
  return { agents, scan, packages, truncated }
}

/**
 * Run detection and reconcile against the agents table.
 *
 * Reports rather than mutates — nothing is inserted, enabled or disabled here.
 * Registering a discovered CLI is a decision, not a detection result.
 */
export async function detectClis(options: { cwd?: string; sessionId?: string } = {}): Promise<CliDetectionReport> {
  // Every layer-2 row, including disabled ones: "is Freebuff actually there?"
  // is exactly the question worth answering about a disabled row.
  const layer2 = await listAgents(2)
  const names = [...new Set(layer2.map((a) => executableOf(a.cliCommand ?? '')).filter(Boolean))]

  const run = await runHeadless(`bash -c ${base64Arg(detectionScript(names))}`, {
    timeoutMs: DETECT_TIMEOUT_MS,
    runId: `detect-${Date.now()}`,
    sessionId: options.sessionId,
    cwd: options.cwd,
  })

  const { agents: found, scan, packages, truncated } = parseDetection(run.output)

  const agentDetections: AgentDetection[] = layer2.map((agent) => {
    const executable = executableOf(agent.cliCommand ?? '')
    const hit = executable ? found.get(executable) : undefined
    return {
      agent,
      executable,
      installed: !!hit,
      path: hit?.path ?? null,
      version: hit?.version ?? null,
    }
  })

  const registered = new Set(agentDetections.map((d) => d.executable).filter(Boolean))
  const discovered: DetectedBinary[] = [...scan.entries()]
    .map(([name, path]) => ({
      name,
      path,
      version: found.get(name)?.version ?? null,
      fromAgentsTable: registered.has(name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const warning =
    run.failure ??
    (run.timedOut
      ? `detection timed out after ${DETECT_TIMEOUT_MS}ms`
      : run.exitCode !== 0
        ? `detection script exited ${run.exitCode ?? 'with no end marker'}`
        : found.size === 0 && scan.size === 0
          ? 'detection produced no parseable records'
          : null)

  return {
    host: run.backendKind,
    detectedAt: new Date().toISOString(),
    agents: agentDetections,
    discovered,
    candidates: discovered.filter((d) => !d.fromAgentsTable),
    packages: packages.sort((a, b) => a.name.localeCompare(b.name)),
    truncated,
    warning,
    raw: run.output,
  }
}
