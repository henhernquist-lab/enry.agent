// Batch 2 — the headless builder adapter.
//
// Takes a task that Batch 1 stored, finds the layer-2 agent assigned to it, and
// runs that agent's CLI once, non-interactively, inside a real terminal session.
// The three touchpoints Batch 1 was built for: listAgents(2, true) to resolve
// the CLI, updateTaskStatus to mark it running, recordResult to store what came
// back.
//
// ─── Why headless, not a puppeted TUI ──────────────────────────────────
// The interactive CLIs open auth prompts, trust dialogs and pagers that differ
// per vendor and per version. Driving those by sending keystrokes is guesswork
// that breaks on any UI change. `<cli> -p "<prompt>"` runs once, prints to
// stdout and exits — a contract that holds across versions.
//
// ─── Why the same terminal machinery, not a child_process ──────────────
// On Vercel there is no local machine to spawn on: the whole reason the Cruise
// terminal routes through a Fly Sprite is that a serverless function can't hold
// a process. Reusing pty-manager / sprite-manager means the builder runs on the
// same VM, with the same repo checkout and the same authenticated CLIs the
// human already set up by hand — and a human can watch a run by attaching to
// the session id. Spawning our own process would work only in the Codespace
// and would need every CLI re-authenticated somewhere else.

import {
  createSession as createLocalSession,
  writeInput as writeLocalInput,
  killSession as killLocalSession,
  subscribe as subscribeLocal,
} from '@/lib/terminal/pty-manager'
import {
  createSession as createSpriteSession,
  writeInput as writeSpriteInput,
  killSession as killSpriteSession,
  subscribe as subscribeSprite,
} from '@/lib/terminal/sprite-manager'
import { getTask, listAgents, recordResult, updateTaskStatus } from './store'
import type { Agent, Task, TaskResult } from './types'

/** Default wall-clock cap for one builder run. */
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

/** Give bash time to print its first prompt before typing at it. */
const SHELL_READY_TIMEOUT_MS = 10_000

/** Geometry for the headless session. Wide enough that CLIs don't hard-wrap. */
const HEADLESS_COLS = 200
const HEADLESS_ROWS = 50

export class BuilderAdapterError extends Error {
  readonly detail?: unknown
  constructor(message: string, detail?: unknown) {
    super(message)
    this.name = 'BuilderAdapterError'
    this.detail = detail
  }
}

// ─── Terminal backend selection ────────────────────────────────────────
// Mirrors the branch in src/app/api/terminal/pty/route.ts exactly: Vercel uses
// the Sprite, the Codespace uses node-pty. Kept as one adapter object so the
// run logic below never branches on environment.

interface TerminalBackend {
  readonly kind: 'sprite' | 'local'
  create(opts: { cols: number; rows: number; cwd?: string }): Promise<{ id: string }>
  write(id: string, data: string): Promise<boolean>
  kill(id: string): Promise<boolean>
  subscribe(id: string, onData: (data: string) => void, onExit?: (code: number) => void): () => void
}

function backend(): TerminalBackend {
  if (process.env.VERCEL) {
    return {
      kind: 'sprite',
      create: (opts) => createSpriteSession(opts),
      write: (id, data) => writeSpriteInput(id, data),
      kill: (id) => killSpriteSession(id),
      subscribe: (id, onData, onExit) => subscribeSprite(id, onData, onExit),
    }
  }
  return {
    kind: 'local',
    create: async (opts) => createLocalSession(opts),
    write: async (id, data) => writeLocalInput(id, data),
    kill: async (id) => killLocalSession(id),
    subscribe: (id, onData, onExit) => subscribeLocal(id, onData, onExit),
  }
}

// ─── Command construction ──────────────────────────────────────────────

/**
 * Wrap the CLI invocation so the output stream self-delimits.
 *
 * A TTY has no framing: output from the previous command, the echoed command
 * line and the next shell prompt all arrive on the same byte stream. Markers
 * are what tell the reader where this run's output starts and stops, and
 * `$?` rides along on the end marker so success is the CLI's real exit code
 * rather than a guess from scanning for crash text.
 *
 * The markers appear twice in the stream — once in the TTY's echo of the
 * command line, once when actually printed. The echoed copy carries the
 * literal `%d`, so a marker regex that demands digits only ever matches the
 * real one. See parseRun().
 *
 * The prompt is base64'd rather than quoted. Task descriptions are free text
 * that routinely contain quotes, backticks, `$` and newlines; every one of
 * those either breaks out of shell quoting or turns one typed line into
 * several, and a multi-line paste into a TTY is at the mercy of readline.
 * Base64 makes the typed line a single token with no shell-special bytes in it.
 */
function buildCommand(cliCommand: string, prompt: string, taskId: string, cwd?: string): string {
  const encoded = Buffer.from(prompt, 'utf8').toString('base64')
  const cd = cwd ? `cd ${shellQuote(cwd)} 2>/dev/null; ` : ''
  return (
    `${cd}printf '\\n${startMarker(taskId)}\\n'; ` +
    `${cliCommand} -p "$(printf %s ${shellQuote(encoded)} | base64 -d)"; ` +
    `printf '\\n${doneMarkerPrefix(taskId)}%d__\\n' "$?"`
  )
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

const startMarker = (taskId: string) => `__GOLEM_RUN_START_${markerId(taskId)}__`
const doneMarkerPrefix = (taskId: string) => `__GOLEM_RUN_DONE_${markerId(taskId)}_`

/** Marker bodies go through the shell as literals — keep them [A-Za-z0-9_]. */
function markerId(taskId: string): string {
  return taskId.replaceAll(/[^A-Za-z0-9]/g, '').toUpperCase()
}

// ─── Output parsing ────────────────────────────────────────────────────

/** CSI / OSC escape sequences. Stored output is read by humans and validators. */
const ANSI_PATTERN =/\x1B\[[0-9;?]*[ -/]*[@-~]|\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g

function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_PATTERN, '').replaceAll('\r\n', '\n').replaceAll('\r', '')
}

interface ParsedRun {
  output: string
  exitCode: number
}

/**
 * Pull this run's output and exit code out of the raw TTY stream, or null if
 * the run hasn't finished yet.
 */
function parseRun(raw: string, taskId: string): ParsedRun | null {
  const clean = stripAnsi(raw)
  const done = new RegExp(`${doneMarkerPrefix(taskId)}(\\d+)__`).exec(clean)
  if (!done) return null

  const before = clean.slice(0, done.index)
  // lastIndexOf, not indexOf: the first hit is inside the TTY's echo of the
  // command line, the last is the marker the shell actually printed.
  const start = before.lastIndexOf(startMarker(taskId))
  const body = start === -1 ? before : before.slice(start + startMarker(taskId).length)

  return { output: body.replace(/^\n+/, '').replace(/\n+$/, ''), exitCode: Number(done[1]) }
}

// ─── The run ───────────────────────────────────────────────────────────

export interface RunBuilderTaskOptions {
  /** Wall-clock cap. Defaults to DEFAULT_TIMEOUT_MS (5 min). */
  timeoutMs?: number
  /**
   * Run inside an existing terminal session instead of a throwaway one — lets
   * a human watch the run in a Forge pane. The session is left open afterwards.
   */
  sessionId?: string
  /** Working directory. Ignored on the Sprite path (see sprite-manager). */
  cwd?: string
}

export interface RunBuilderTaskResult {
  task: Task
  agent: Agent
  result: TaskResult
  /** Exit code of the CLI, or null if the run never reached its end marker. */
  exitCode: number | null
  output: string
  durationMs: number
  timedOut: boolean
  sessionId: string
}

/**
 * Run one task's assigned builder, once, and record the result.
 *
 * Deliberately does NOT move the task past `running` afterwards — Batch 1's
 * recordResult contract leaves the validating/failed decision to the caller,
 * which from Batch 3 onwards is the dispatcher.
 */
export async function runBuilderTask(
  taskId: string,
  options: RunBuilderTaskOptions = {},
): Promise<RunBuilderTaskResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const task = await getTask(taskId)
  if (!task) throw new BuilderAdapterError(`runBuilderTask: task ${taskId} not found`)
  if (!task.assignedAgent) {
    throw new BuilderAdapterError(`runBuilderTask: task ${taskId} has no assigned agent`)
  }

  // Layer 2 + enabled is the whole eligibility rule; resolving through this
  // list rather than by id means a disabled or wrong-layer agent can't be
  // dispatched to even if something wrote its id onto the task.
  const builders = await listAgents(2, true)
  const agent = builders.find((candidate) => candidate.id === task.assignedAgent)
  if (!agent) {
    throw new BuilderAdapterError(
      `runBuilderTask: assigned agent ${task.assignedAgent} is not an enabled layer-2 builder`,
    )
  }
  if (!agent.cliCommand) {
    // The migration's check constraint makes this unreachable; treated as a
    // real error rather than an assertion so a hand-edited row fails loudly.
    throw new BuilderAdapterError(`runBuilderTask: agent ${agent.name} has no cli_command`)
  }

  const prompt = task.description.trim() || task.title
  const term = backend()

  const startedAt = Date.now()
  let sessionId = options.sessionId ?? null
  const ownsSession = sessionId === null
  let buffer = ''
  let unsubscribe: (() => void) | null = null
  let timedOut = false
  let parsed: ParsedRun | null = null
  let failure: string | null = null

  await updateTaskStatus(taskId, 'running', { agent: agent.name, cli: agent.cliCommand })

  try {
    if (sessionId === null) {
      const created = await term.create({ cols: HEADLESS_COLS, rows: HEADLESS_ROWS, cwd: options.cwd })
      sessionId = created.id
    }

    // Subscribe before writing so no output can land in the gap.
    let onChunk: ((chunk: string) => void) | null = null
    let shellReady: (() => void) | null = null
    unsubscribe = term.subscribe(sessionId, (chunk) => {
      buffer += chunk
      shellReady?.()
      onChunk?.(chunk)
    })

    // Bash prints its prompt a beat after the session exists. Typing into that
    // gap is how keystrokes get dropped; the timeout means a silent shell
    // costs 10s rather than the whole run.
    await new Promise<void>((resolve) => {
      if (buffer.length > 0) return resolve()
      const timer = setTimeout(resolve, SHELL_READY_TIMEOUT_MS)
      shellReady = () => {
        clearTimeout(timer)
        shellReady = null
        resolve()
      }
    })

    const command = buildCommand(agent.cliCommand, prompt, taskId, options.cwd)
    const written = await term.write(sessionId, `${command}\n`)
    if (!written) {
      throw new BuilderAdapterError(
        `runBuilderTask: terminal session ${sessionId} rejected the command (${term.kind} backend)`,
      )
    }

    parsed = await new Promise<ParsedRun | null>((resolve) => {
      // Output arrives in arbitrary chunks, so re-parse the whole buffer each
      // time — the end marker can straddle a chunk boundary.
      const check = () => {
        const found = parseRun(buffer, taskId)
        if (found) {
          clearTimeout(timer)
          onChunk = null
          resolve(found)
        }
      }
      const timer = setTimeout(() => {
        timedOut = true
        onChunk = null
        resolve(null)
      }, timeoutMs)
      onChunk = check
      check() // in case the run already finished while we were setting up
    })

    if (timedOut) {
      // Ctrl-C first: on a reused session it leaves the shell usable, and on a
      // throwaway one it still gives the CLI a chance to flush before the kill.
      await term.write(sessionId, '\x03').catch(() => false)
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err)
  } finally {
    unsubscribe?.()
    if (ownsSession && sessionId) {
      await term.kill(sessionId).catch(() => false)
    }
  }

  const durationMs = Date.now() - startedAt
  const exitCode = parsed?.exitCode ?? null
  // If the run never produced its markers there is nothing to slice, so fall
  // back to the raw stream — a crashed CLI's stderr is the most useful thing
  // we have and throwing it away would make the failure undiagnosable.
  const output = parsed?.output ?? stripAnsi(buffer).trim()

  const success = failure === null && !timedOut && exitCode === 0
  const error = failure
    ? failure
    : timedOut
      ? `timeout after ${timeoutMs}ms`
      : exitCode === null
        ? 'run ended without an end marker — the shell or CLI died mid-run'
        : exitCode === 0
          ? null
          : `${agent.cliCommand} exited ${exitCode}`

  const result = await recordResult(taskId, agent.id, output, success, error, durationMs)

  return {
    task,
    agent,
    result,
    exitCode,
    output,
    durationMs,
    timedOut,
    sessionId: sessionId ?? '',
  }
}
