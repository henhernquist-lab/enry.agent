import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import type { ParsedCommand } from './parse'
import { confinePath } from './snapshot'
import { EXEC_TIMEOUT_MS, MAX_OUTPUT_BYTES } from './allowlist'

// Live Terminal — execution of validated file/tree commands over a snapshot.
//
// Real binaries are run via execFile with an argv array (NEVER a shell),
// cwd pinned to the snapshot root, an empty env, a hard timeout, and a bounded
// output buffer. `tree` is a TypeScript walk because the binary isn't on the
// Vercel runtime.

export interface ExecResult {
  output: string
  exitCode: number
}

// Positionals that are NOT paths and must be skipped by path confinement.
function pathPositionals(parsed: ParsedCommand): string[] {
  // grep's first positional is the search PATTERN, not a path.
  if (parsed.command === 'grep') return parsed.positionals.slice(1)
  return parsed.positionals
}

export async function runCommand(parsed: ParsedCommand, snapshotDir: string): Promise<ExecResult> {
  // Confinement: every path argument must resolve inside the snapshot root.
  for (const pos of pathPositionals(parsed)) {
    if (confinePath(snapshotDir, pos) === null) {
      return { output: `path escapes repository: "${pos}"`, exitCode: 1 }
    }
  }

  if (parsed.spec.executor === 'tree') {
    return runTree(parsed, snapshotDir)
  }
  return runFileBinary(parsed, snapshotDir)
}

function runFileBinary(parsed: ParsedCommand, snapshotDir: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      parsed.command,
      parsed.args,
      {
        cwd: snapshotDir,
        // Only PATH is passed through — enough to resolve the binary, nothing
        // sensitive (no API keys, no tokens) leaks into the child process.
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } as unknown as NodeJS.ProcessEnv,
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        killSignal: 'SIGKILL',
      },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed) {
          resolve({ output: `Command timed out after ${EXEC_TIMEOUT_MS / 1000}s and was killed.`, exitCode: 124 })
          return
        }
        const combined = (stdout ?? '') + (stderr ?? '')
        const truncated =
          combined.length > MAX_OUTPUT_BYTES
            ? combined.slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated]'
            : combined
        const code = err ? ((err as NodeJS.ErrnoException & { code?: number }).code ?? 1) : 0
        resolve({ output: truncated || '', exitCode: typeof code === 'number' ? code : 1 })
      },
    )
  })
}

// ─── tree (TypeScript implementation) ───────────────────────────────────────
async function runTree(parsed: ParsedCommand, snapshotDir: string): Promise<ExecResult> {
  const maxDepth = readIntFlag(parsed, '-L') ?? Infinity
  const showAll = parsed.flags.includes('-a')
  const dirsOnly = parsed.flags.includes('-d')
  const startArg = parsed.positionals[0] ?? '.'
  const startAbs = confinePath(snapshotDir, startArg)
  if (startAbs === null) return { output: `path escapes repository: "${startArg}"`, exitCode: 1 }

  const lines: string[] = [startArg]
  let dirCount = 0
  let fileCount = 0

  async function walk(dir: string, prefix: string, depth: number) {
    if (depth > maxDepth) return
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const filtered = entries
      .filter((e) => showAll || !e.name.startsWith('.'))
      .filter((e) => !dirsOnly || e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))

    for (let i = 0; i < filtered.length; i++) {
      const e = filtered[i]
      const last = i === filtered.length - 1
      const connector = last ? '└── ' : '├── '
      lines.push(prefix + connector + e.name)
      if (e.isDirectory()) {
        dirCount++
        await walk(path.join(dir, e.name), prefix + (last ? '    ' : '│   '), depth + 1)
      } else {
        fileCount++
      }
    }
  }

  await walk(startAbs, '', 1)
  lines.push('')
  lines.push(`${dirCount} director${dirCount === 1 ? 'y' : 'ies'}, ${fileCount} file${fileCount === 1 ? '' : 's'}`)
  return { output: lines.join('\n'), exitCode: 0 }
}

function readIntFlag(parsed: ParsedCommand, flag: string): number | null {
  const idx = parsed.flags.indexOf(flag)
  if (idx !== -1 && parsed.flags[idx + 1] !== undefined) {
    const n = parseInt(parsed.flags[idx + 1], 10)
    return Number.isNaN(n) ? null : n
  }
  // combined form -L2
  const combined = parsed.flags.find((f) => f.startsWith(flag) && /\d/.test(f))
  if (combined) {
    const n = parseInt(combined.slice(flag.length), 10)
    return Number.isNaN(n) ? null : n
  }
  return null
}
