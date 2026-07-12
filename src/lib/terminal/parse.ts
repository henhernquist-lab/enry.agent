import {
  FILE_COMMANDS,
  GIT_COMMANDS,
  BLOCKED_BINARIES,
  FORBIDDEN_CHARS,
  type CommandSpec,
} from './allowlist'

// Live Terminal — tokenizer + validator. Pure and unit-testable; no I/O.
//
// The whole strategy is "reject, never escape". We refuse anything with shell
// metacharacters up front, tokenize with a shell-free splitter (no escape
// processing, no expansion, no globbing), then validate every token against the
// allowlist. A command survives only if every piece is explicitly permitted.

export interface ParsedCommand {
  command: string
  spec: CommandSpec
  subcommand?: string
  flags: string[]
  positionals: string[]
  // Tokens after the binary (for git, after the subcommand). Passed to the
  // file executor as argv, or interpreted by the git-API mapper.
  args: string[]
}

export type ParseResult = { ok: true; parsed: ParsedCommand } | { ok: false; error: string }

const MAX_INPUT_LEN = 400

// ─── Step 1: raw-input scan (before any parsing) ────────────────────────────
export function scanRawInput(raw: string): string | null {
  if (raw.length > MAX_INPUT_LEN) return `Command too long (max ${MAX_INPUT_LEN} chars).`
  for (const ch of FORBIDDEN_CHARS) {
    if (ch === '*?') continue // handled as a pair below; kept for documentation
    if (raw.includes(ch)) {
      const label = ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : ch
      return `Rejected: the character "${label}" is not allowed (no shell metacharacters, redirection, or command chaining).`
    }
  }
  return null
}

// ─── Step 2: shell-free tokenizer ───────────────────────────────────────────
// Whitespace split with "..." grouping only. No escape processing, no
// variable expansion. Unbalanced double quotes → error.
//
// Deliberately double-quote-only, not '...' too: this parser also has to
// tokenize free-text instructions (edit/write instructions, natural-language
// requests) where a bare "'" is overwhelmingly an English apostrophe
// ("doesn't", "the user's session"), not a shell quote. Treating it as a
// grouping character turned every contraction into a false "unbalanced
// quotes" rejection. Quoted commit/pr messages already use double quotes
// (see meta-parse.ts usage strings), so single-quote grouping was never load-
// bearing — dropping it removes the ambiguity for free.
export function tokenize(raw: string): { tokens: string[] } | { error: string } {
  const tokens: string[] = []
  let i = 0
  const n = raw.length
  while (i < n) {
    // skip whitespace
    while (i < n && (raw[i] === ' ' || raw[i] === '\t')) i++
    if (i >= n) break

    let token = ''
    while (i < n && raw[i] !== ' ' && raw[i] !== '\t') {
      const c = raw[i]
      if (c === '"') {
        i++
        const start = i
        while (i < n && raw[i] !== c) i++
        if (i >= n) return { error: 'Rejected: unbalanced quotes.' }
        token += raw.slice(start, i)
        i++ // skip closing quote
      } else {
        token += c
        i++
      }
    }
    tokens.push(token)
  }
  return { tokens }
}

// ─── Step 3: validate against the allowlist ─────────────────────────────────
export function validateCommand(raw: string): ParseResult {
  const rawErr = scanRawInput(raw.trim())
  if (rawErr) return { ok: false, error: rawErr }

  const tok = tokenize(raw.trim())
  if ('error' in tok) return { ok: false, error: tok.error }
  const tokens = tok.tokens
  if (tokens.length === 0) return { ok: false, error: 'Empty command.' }

  const command = tokens[0]

  if (BLOCKED_BINARIES.has(command)) {
    return { ok: false, error: `Blocked: "${command}" is a write/network/execution command and is never permitted. This terminal is read-only.` }
  }

  if (command === 'git') {
    return validateGit(tokens)
  }

  const spec = FILE_COMMANDS[command]
  if (!spec) {
    return { ok: false, error: `Command not permitted: "${command}". Allowed: ${[...Object.keys(FILE_COMMANDS), 'git'].join(', ')}.` }
  }

  const post = tokens.slice(1)
  const res = validateArgs(command, spec, post)
  if (!res.ok) return res
  return { ok: true, parsed: { command, spec, flags: res.flags, positionals: res.positionals, args: post } }
}

function validateGit(tokens: string[]): ParseResult {
  const subcommand = tokens[1]
  if (!subcommand) {
    return { ok: false, error: `git requires a subcommand. Allowed: ${Object.keys(GIT_COMMANDS).join(', ')}.` }
  }
  const spec = GIT_COMMANDS[subcommand]
  if (!spec) {
    return { ok: false, error: `git subcommand not permitted: "${subcommand}". Allowed: ${Object.keys(GIT_COMMANDS).join(', ')}.` }
  }
  const post = tokens.slice(2)
  const res = validateArgs(`git ${subcommand}`, spec, post)
  if (!res.ok) return res
  return { ok: true, parsed: { command: 'git', spec, subcommand, flags: res.flags, positionals: res.positionals, args: post } }
}

type ArgsResult = { ok: true; flags: string[]; positionals: string[] } | { ok: false; error: string }

const INT_RE = /^-?\d+$/
const SHORT_INT_COMBINED = /^(-[a-zA-Z])(\d+)$/ // e.g. -n5, -L2

function validateArgs(label: string, spec: CommandSpec, post: string[]): ArgsResult {
  const flags: string[] = []
  const positionals: string[] = []
  let sawSeparator = false

  for (let i = 0; i < post.length; i++) {
    const token = post[i]

    // Everything after a bare "--" is positional (paths/refs).
    if (sawSeparator) {
      positionals.push(token)
      continue
    }
    if (token === '--') {
      sawSeparator = true
      continue
    }

    const isFlag = token.startsWith('-') && token !== '-'
    if (!isFlag) {
      positionals.push(token)
      continue
    }

    // `--flag=value` form
    if (token.includes('=')) {
      const [name, ...rest] = token.split('=')
      const value = rest.join('=')
      if (spec.eqFlags.includes(name)) {
        if (!value) return rej(label, token)
        flags.push(token)
        continue
      }
      if (spec.intFlags.includes(name)) {
        if (!INT_RE.test(value)) return { ok: false, error: `Flag ${name} requires an integer.` }
        flags.push(token)
        continue
      }
      return rej(label, token)
    }

    // combined short int flag, e.g. -n5
    const combined = token.match(SHORT_INT_COMBINED)
    if (combined && spec.intFlags.includes(combined[1])) {
      flags.push(token)
      continue
    }

    if (spec.booleanFlags.includes(token)) {
      flags.push(token)
      continue
    }

    if (spec.intFlags.includes(token)) {
      const next = post[i + 1]
      if (next === undefined || !INT_RE.test(next)) {
        return { ok: false, error: `Flag ${token} requires an integer argument.` }
      }
      flags.push(token, next)
      i++
      continue
    }

    if (spec.valueFlags.includes(token)) {
      const next = post[i + 1]
      if (next === undefined) return { ok: false, error: `Flag ${token} requires a value.` }
      // A value that itself looks like a flag is almost always a mistake or an
      // attempt to smuggle one — reject.
      if (next.startsWith('-')) return { ok: false, error: `Flag ${token} requires a value, got "${next}".` }
      flags.push(token, next)
      i++
      continue
    }

    return rej(label, token)
  }

  if (positionals.length > spec.maxPositionals) {
    return { ok: false, error: `Too many arguments for ${label} (max ${spec.maxPositionals}).` }
  }

  return { ok: true, flags, positionals }
}

function rej(label: string, token: string): ArgsResult {
  return { ok: false, error: `Flag not permitted for ${label}: "${token}".` }
}
