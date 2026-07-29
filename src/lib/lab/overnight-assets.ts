import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The files Golem commits into a scratch repo so an overnight run can be
// dispatched to it. Kept as real files under overnight-runner/ (reviewable,
// lintable) and read at runtime by the dispatch route — see
// outputFileTracingIncludes in next.config.ts, which makes Vercel bundle them.
// Same arrangement as cruise-runner/ + src/lib/cruise/runner-assets.ts.

export const OVERNIGHT_RUNNER_VERSION = 1
export const OVERNIGHT_MANAGED_MARKER = 'enry-overnight:managed'
export const OVERNIGHT_WORKFLOW_PATH = '.github/workflows/enry-overnight.yml'
export const OVERNIGHT_SCRIPT_PATH = '.enry-overnight/exp.mjs'
/** The workflow filename alone — what the workflow_dispatch API addresses. */
export const OVERNIGHT_WORKFLOW_FILE = 'enry-overnight.yml'

export interface RunnerFile {
  path: string
  content: string
}

function load(name: string): string {
  const raw = readFileSync(join(process.cwd(), 'overnight-runner', name), 'utf8')
  return raw.replace(
    new RegExp(`${OVERNIGHT_MANAGED_MARKER} v\\d+`),
    `${OVERNIGHT_MANAGED_MARKER} v${OVERNIGHT_RUNNER_VERSION}`,
  )
}

export function overnightRunnerFiles(): RunnerFile[] {
  return [
    { path: OVERNIGHT_WORKFLOW_PATH, content: load('enry-overnight.yml') },
    { path: OVERNIGHT_SCRIPT_PATH, content: load('exp.mjs') },
  ]
}

/** Version stamped into a committed workflow, or 0 if absent/unparseable. */
export function overnightManagedVersion(content: string): number {
  const m = content.match(new RegExp(`${OVERNIGHT_MANAGED_MARKER} v(\\d+)`))
  return m ? Number(m[1]) : 0
}

export function isOvernightManaged(content: string): boolean {
  return content.includes(OVERNIGHT_MANAGED_MARKER)
}
