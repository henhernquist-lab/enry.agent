import { scanRawInput, tokenize } from './parse'

// Live Terminal write mode — meta-command parser.
//
// Deliberately SEPARATE from parse.ts (the read-only allowlist parser), not
// bolted onto it. These commands have a different argument shape (quoted
// multi-word strings for commit/pr messages) and different semantics
// (app-level actions, never passed to execFile) — keeping them apart means
// the read-only parser's already-tested injection-prevention logic can't be
// regressed by this addition. Raw-input scanning and quote-aware tokenizing
// ARE reused from parse.ts (same rules: no shell metacharacters, no escape
// processing) rather than re-implemented.

export type MetaCommand =
  | { kind: 'edit'; file: string; instruction: string }
  | { kind: 'write'; file: string; instruction: string }
  | { kind: 'apply' }
  | { kind: 'discard' }
  | { kind: 'branch'; name: string }
  | { kind: 'commit'; message: string }
  | { kind: 'pr'; title: string; description: string }

export type MetaParseResult = { ok: true; command: MetaCommand } | { ok: false; error: string } | { ok: false; notMeta: true }

const META_KEYWORDS = new Set(['edit', 'write', 'apply', 'discard', 'branch', 'commit', 'pr'])

// A conservative, real-git-compatible branch name charset. No spaces, no
// leading '-' (flag-injection lookalike), no '..', doesn't end in '.lock'.
const SAFE_BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/

export function looksLikeMetaCommand(raw: string): boolean {
  const first = raw.trim().split(/\s+/)[0]
  return META_KEYWORDS.has(first)
}

export function parseMetaCommand(raw: string): MetaParseResult {
  const trimmed = raw.trim()
  const first = trimmed.split(/\s+/)[0]
  if (!META_KEYWORDS.has(first)) return { ok: false, notMeta: true }

  const rawErr = scanRawInput(trimmed)
  if (rawErr) return { ok: false, error: rawErr }

  const tok = tokenize(trimmed)
  if ('error' in tok) return { ok: false, error: tok.error }
  const [keyword, ...rest] = tok.tokens

  switch (keyword) {
    case 'edit':
    case 'write': {
      if (rest.length === 0 || !rest[0]) {
        return { ok: false, error: `Usage: ${keyword} <file> [instruction]` }
      }
      // First token is the file; any remaining tokens (unquoted words or a
      // single quoted phrase — tokenize() already handles both) join into
      // the instruction. No instruction given -> a generic one, filled in
      // by the caller, not here (this module has no repo/LLM context).
      const instruction = rest.slice(1).join(' ')
      return { ok: true, command: { kind: keyword, file: rest[0], instruction } }
    }
    case 'apply': {
      if (rest.length !== 0) return { ok: false, error: 'Usage: apply (no arguments)' }
      return { ok: true, command: { kind: 'apply' } }
    }
    case 'discard': {
      if (rest.length !== 0) return { ok: false, error: 'Usage: discard (no arguments)' }
      return { ok: true, command: { kind: 'discard' } }
    }
    case 'branch': {
      if (rest.length !== 1 || !rest[0]) return { ok: false, error: 'Usage: branch <name>' }
      const name = rest[0]
      if (!SAFE_BRANCH_RE.test(name) || name.includes('..') || name.endsWith('.lock')) {
        return { ok: false, error: `Invalid branch name: "${name}".` }
      }
      return { ok: true, command: { kind: 'branch', name } }
    }
    case 'commit': {
      if (rest.length !== 1 || !rest[0].trim()) {
        return { ok: false, error: 'Usage: commit "<message>" (quoted, one argument)' }
      }
      return { ok: true, command: { kind: 'commit', message: rest[0].trim() } }
    }
    case 'pr': {
      if (rest.length !== 2 || !rest[0].trim() || !rest[1].trim()) {
        return { ok: false, error: 'Usage: pr "<title>" "<description>" (both quoted)' }
      }
      return { ok: true, command: { kind: 'pr', title: rest[0].trim(), description: rest[1].trim() } }
    }
    default:
      return { ok: false, notMeta: true }
  }
}
