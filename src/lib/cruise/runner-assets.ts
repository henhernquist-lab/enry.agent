import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The files enry.agent commits into an allowlisted repo to enable Cruise. Kept
// as real files under cruise-runner/ (reviewable, lintable) and read at runtime
// by the enable route — see outputFileTracingIncludes in next.config.ts, which
// makes Vercel bundle them.

export const RUNNER_VERSION = 1
// First line of the workflow file carries "<MANAGED_MARKER> v<version>". The
// enable flow uses it to tell our file apart from a user's own workflow of the
// same name (conflict detection) and to detect version drift for updates.
export const MANAGED_MARKER = 'enry-cruise:managed'
export const WORKFLOW_PATH = '.github/workflows/enry-cruise.yml'
export const SCAN_SCRIPT_PATH = '.enry-cruise/scan.mjs'

export interface RunnerFile {
  path: string
  content: string
}

function load(name: string): string {
  return readFileSync(join(process.cwd(), 'cruise-runner', name), 'utf8')
}

// The set of files a fresh enable commits. Order is irrelevant — they land in
// one atomic commit.
export function runnerFiles(): RunnerFile[] {
  return [
    { path: WORKFLOW_PATH, content: load('enry-cruise.yml') },
    { path: SCAN_SCRIPT_PATH, content: load('scan.mjs') },
  ]
}

// True if an existing workflow file at WORKFLOW_PATH is one we manage (safe to
// update) vs. a user's own file that happens to share the name (a conflict).
export function isManaged(existingContent: string): boolean {
  return existingContent.includes(MANAGED_MARKER)
}
