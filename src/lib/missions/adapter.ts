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

import { runHeadless, base64Arg } from '@/lib/terminal/headless-run'
import { getTask, listAgents, recordResult, updateTaskStatus } from './store'
import type { Agent, Task, TaskResult } from './types'

/** Default wall-clock cap for one builder run. */
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

export class BuilderAdapterError extends Error {
  readonly detail?: unknown
  constructor(message: string, detail?: unknown) {
    super(message)
    this.name = 'BuilderAdapterError'
    this.detail = detail
  }
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

  await updateTaskStatus(taskId, 'running', { agent: agent.name, cli: agent.cliCommand })

  const run = await runHeadless(`${agent.cliCommand} -p ${base64Arg(prompt)}`, {
    timeoutMs,
    runId: taskId,
    sessionId: options.sessionId,
    cwd: options.cwd,
  })

  const { output, exitCode, timedOut, durationMs } = run
  const success = run.failure === null && !timedOut && exitCode === 0
  const error = run.failure
    ? run.failure
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
    sessionId: run.sessionId,
  }
}
