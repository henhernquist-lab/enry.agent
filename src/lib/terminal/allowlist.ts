// Live Terminal — the STRICT command allowlist.
//
// Security model: reject, never escape. Anything not explicitly described here
// is denied. Read-only operations only. See parse.ts for the tokenizer +
// validator that enforces this table, and exec.ts / git-api.ts for execution.

export type Executor = 'file' | 'tree' | 'git'

export interface CommandSpec {
  // How the command is executed: a real binary over the snapshot ('file'), a
  // TypeScript walk ('tree', because the binary isn't on Vercel), or mapped to
  // the GitHub API ('git').
  executor: Executor
  // Boolean flags (no argument). Short flags here may be bundled (e.g. -la).
  booleanFlags: string[]
  // Flags that consume the next token as an integer (e.g. -n 20, --max-count 5).
  intFlags: string[]
  // Flags that consume the next token as an opaque value/glob (e.g. -name '*.ts').
  valueFlags: string[]
  // `--flag=value` style flags whose value is opaque (e.g. --include=*.ts).
  eqFlags: string[]
  // Max positional (non-flag) arguments allowed. Paths/patterns/refs.
  maxPositionals: number
  // For git: the allowlisted subcommand (argv[1]).
  gitSubcommand?: string
}

// Non-git commands, keyed by binary name.
export const FILE_COMMANDS: Record<string, CommandSpec> = {
  ls: {
    executor: 'file',
    booleanFlags: ['-a', '-l', '-h', '-R', '-1', '-t', '-r', '-S', '-la', '-al', '-lh', '-la', '-lrt', '-ltr'],
    intFlags: [],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 4,
  },
  cat: {
    executor: 'file',
    booleanFlags: ['-n'],
    intFlags: [],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 8,
  },
  head: {
    executor: 'file',
    booleanFlags: [],
    intFlags: ['-n', '-c'],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 8,
  },
  tail: {
    executor: 'file',
    booleanFlags: [],
    intFlags: ['-n', '-c'],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 8,
  },
  grep: {
    executor: 'file',
    booleanFlags: ['-i', '-n', '-l', '-c', '-v', '-w', '-E', '-F', '-r', '-R', '-H', '-in', '-rn', '-ni', '-rin', '-irn'],
    intFlags: ['-A', '-B', '-C'],
    valueFlags: [],
    eqFlags: ['--include', '--exclude'],
    maxPositionals: 8, // pattern + paths
  },
  find: {
    executor: 'file',
    booleanFlags: [],
    intFlags: ['-maxdepth', '-mindepth'],
    valueFlags: ['-name', '-iname', '-path', '-ipath', '-type', '-size'],
    eqFlags: [],
    maxPositionals: 2, // starting path(s)
  },
  wc: {
    executor: 'file',
    booleanFlags: ['-l', '-w', '-c', '-m'],
    intFlags: [],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 8,
  },
  tree: {
    executor: 'tree',
    booleanFlags: ['-a', '-d', '-f'],
    intFlags: ['-L'],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 1,
  },
}

// git subcommands, keyed by subcommand name.
export const GIT_COMMANDS: Record<string, CommandSpec> = {
  log: {
    executor: 'git',
    gitSubcommand: 'log',
    booleanFlags: ['--oneline', '--stat'],
    intFlags: ['-n', '--max-count'],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 2, // optional ref and/or -- path
  },
  status: {
    executor: 'git',
    gitSubcommand: 'status',
    booleanFlags: ['-s', '--short'],
    intFlags: [],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 0,
  },
  diff: {
    executor: 'git',
    gitSubcommand: 'diff',
    booleanFlags: ['--stat', '--name-only'],
    intFlags: [],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 3, // ref, ref..ref, or -- path
  },
  show: {
    executor: 'git',
    gitSubcommand: 'show',
    booleanFlags: ['--stat', '--name-only'],
    intFlags: [],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 2,
  },
  branch: {
    executor: 'git',
    gitSubcommand: 'branch',
    booleanFlags: ['-a', '-r', '-v', '--all'],
    intFlags: [],
    valueFlags: [],
    eqFlags: [],
    maxPositionals: 0,
  },
}

// Characters that trigger immediate rejection of the RAW input line, before any
// parsing. These enable shell injection / redirection / command chaining, and
// none of them appear in legitimate read-only commands as we support them.
export const FORBIDDEN_CHARS = [';', '&', '|', '>', '<', '`', '$', '\\', '\n', '\r', '\t', '(', ')', '{', '}', '!', '*?']

// Explicitly blocked binaries — surfaced with a specific message even though the
// allowlist would reject them anyway. Helps the user understand the boundary.
export const BLOCKED_BINARIES = new Set([
  'rm', 'mv', 'cp', 'chmod', 'chown', 'curl', 'wget', 'ssh', 'scp', 'sudo', 'su',
  'sh', 'bash', 'zsh', 'eval', 'exec', 'python', 'python3', 'node', 'npm', 'pnpm',
  'yarn', 'dd', 'mkfs', 'kill', 'apt', 'brew', 'nc', 'telnet', 'ln', 'touch',
  'mkdir', 'rmdir', 'tee', 'xargs', 'env', 'export', 'source',
])

export const RATE_LIMIT_PER_MINUTE = 30
export const EXEC_TIMEOUT_MS = 10_000
export const MAX_OUTPUT_BYTES = 1_000_000
