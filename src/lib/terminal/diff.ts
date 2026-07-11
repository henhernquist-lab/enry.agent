import { createTwoFilesPatch, applyPatch, structuredPatch } from 'diff'
import { createHash } from 'crypto'

// Live Terminal write mode — diff generation.
//
// Unified diff text is what gets shown in the terminal (matches `git diff`
// output the read-only terminal already renders); structuredPatch gives the
// UI hunks with per-line add/remove/context markers for coloring without
// re-parsing the text form.

export function generateDiff(filePath: string, oldContent: string, newContent: string): string {
  return createTwoFilesPatch(filePath, filePath, oldContent, newContent, '', '', { context: 3 })
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  text: string
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

// Parses a unified diff into hunks for the terminal UI's colored renderer.
export function parseDiffForDisplay(filePath: string, oldContent: string, newContent: string): DiffHunk[] {
  const patch = structuredPatch(filePath, filePath, oldContent, newContent, '', '', { context: 3 })
  return patch.hunks.map((hunk) => ({
    header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    lines: hunk.lines.map((line): DiffLine => {
      if (line.startsWith('+')) return { type: 'add', text: line.slice(1) }
      if (line.startsWith('-')) return { type: 'remove', text: line.slice(1) }
      return { type: 'context', text: line.slice(1) }
    }),
  }))
}

// Content-addressed stand-in for a GitHub blob sha, used once a file has been
// locally modified (applied but not committed) and no longer has a real
// GitHub sha to stale-check the next edit against.
export function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

// Reconstructs the new file content by applying a previously-generated
// unified diff to the given base content. Used defensively if a caller only
// stored the diff text, not the full new content — the write-ops flow stores
// new_content directly, so this exists mainly for consistency checks.
export function applyDiff(oldContent: string, diffText: string): string | null {
  const result = applyPatch(oldContent, diffText)
  return result === false ? null : result
}
