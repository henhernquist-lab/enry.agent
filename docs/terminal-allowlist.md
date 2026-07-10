# Live Terminal — Command Allowlist Reference

> Security reference for Claude Code building the Live Terminal validator.
> Read-only design doc. Defines exactly which flags are safe, which are
> blocked, how injection attacks work, and why certain commands are never
> permitted.
>
> Core principle: The Live Terminal executes commands via
> `child_process.execFile` (not `exec`) — no shell, no metacharacter
> interpretation. Arguments are passed as an array, not a string.

---

## 1. Allowlist — Read-Only Commands

Each command below is permitted. For each, the table documents:

- **Safe flags** — flags that only affect output formatting and cannot
  write files, execute code, or exfiltrate data beyond what the command
  already reads.
- **Dangerous flags** — flags that MUST be blocked (rejected by the
  validator before the command reaches `execFile`).
- **Validation regex** — a regex that the validator uses to test each
  argument token (all tokens must pass).
- **Injection surface** — how an attacker might try to misuse this
  command despite the allowlist.

### `ls`

| Property | Detail |
| :--- | :--- |
| **Purpose** | List files and directories |
| **Safe flags** | `-1`, `-a`, `-A`, `-C`, `-d`, `-F`, `-G`, `-h`, `-i`, `-l`, `-L`, `-m`, `-n`, `-o`, `-p`, `-q`, `-r`, `-R`, `-s`, `-S`, `-t`, `-u`, `-x`, `--color`, `--group-directories-first`, `--human-readable`, `--sort` (with: `size`, `time`, `extension`, `name`), `--time` (with: `atime`, `ctime`, `mtime`), `--format` (with: `long`, `verbose`, `across`, `single-column`) |
| **Dangerous flags** | `--quoting-style` (can produce eval-able shell output), `-v` (forces unprintable chars to visible — leaks binary data), `--classify` with `-F` only if combined with pipe to subprocess (not our concern but tracked) |
| **Validator regex** | `/^[a-zA-Z0-9_\-\/.@+=:]+$/` — each argument (flag or path) must match |
| **Injection surface** | Path traversal via `../`, symlink following to `/etc/passwd`, flag injection via argument starting with `--` |

**Reject example:**
```
ls --quoting-style=shell-always /tmp         # REJECT — eval-compatible output
ls -l /etc/shadow                            # ALLOW (but command will fail with permission denied — that's fine)
ls -- "$(rm -rf /)"                          # REJECT — metacharacters in path argument
```

### `cat`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Concatenate and display file contents |
| **Safe flags** | `-A` (alias for `-vET`), `-b`, `-E`, `-e`, `-n`, `-s`, `-T`, `-t`, `-u`, `-v`, `--number`, `--number-nonblank`, `--show-all`, `--show-ends`, `--show-tabs`, `--show-nonprinting`, `--squeeze-blank` |
| **Dangerous flags** | `--` alone is fine (end-of-options marker), but if combined with a path argument that starts with `-`, the validator must ensure paths don't look like flags. No flag can write files or execute code — cat's risks are **what files it reads**, not what flags it takes. |
| **Validator regex** | `/^[a-zA-Z0-9_\-\/.@+=:]+$/` |
| **Injection surface** | `/dev/urandom`, `/dev/zero`, `/proc/self/environ`, `/proc/self/fd/*` — reading special files that can hang the terminal or leak process data. The validator should reject paths containing `/dev/` or `/proc/` unless explicitly allowed by a future opt-in. |

**Reject examples:**
```
cat /dev/urandom                             # REJECT — hangs terminal, infinite output
cat /proc/self/environ                       # REJECT — leaks environment variables (API keys)
cat ../../.env                               # REJECT — path traversal to sensitive file
cat -- "$(whoami)"                           # REJECT — metacharacters
```

### `head`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Output the first N lines of a file |
| **Safe flags** | `-n`, `-c`, `-q`, `-v`, `--lines`, `--bytes`, `--quiet`, `--verbose` |
| **Dangerous flags** | None inherently dangerous — `head` cannot write files or execute code. But `-c` with large byte counts and `/dev/urandom` can still hang. |
| **Validator regex** | `/^[a-zA-Z0-9_\-\/.@+=:]+$/` for paths; `/^-?[0-9]+$/` for `-n` and `-c` values |
| **Injection surface** | Same as `cat` — `/dev/*` and `/proc/*` paths; negative line counts that output nothing and leak nothing (safe). |

**Reject examples:**
```
head -n 100 /dev/urandom                     # REJECT — /dev/ path
head -n "$(whoami)" file.txt                 # REJECT — metacharacters in argument
```

### `tail`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Output the last N lines of a file |
| **Safe flags** | `-n`, `-c`, `-q`, `-v`, `-f` (but **only** with `--pid` and a timeout — see note), `--lines`, `--bytes`, `--quiet`, `--verbose`, `--retry`, `--follow`, `--pid` |
| **Dangerous flags** | `-f` (follow) without a timeout or `--pid` can hang the terminal forever. If `-f` is permitted, the validator must enforce a **maximum execution time** (e.g., 5 seconds) and pass it to the execution layer. |
| **Validator regex** | `/^[a-zA-Z0-9_\-\/.@+=:]+$/` for paths; `/^-?[0-9]+$/` for `-n/-c` values; `-f` only allowed if execution timeout ≤ 5s |
| **Injection surface** | `-f` is the primary risk — blocking the terminal indefinitely. Same `/dev/*` path restrictions as `cat`. |

**Reject examples:**
```
tail -f /var/log/syslog                      # REJECT — -f without timeout enforcement
tail -f --pid=1 /var/log/syslog              # ALLOW only if execution timeout is ≤ 5s
tail -n 999999999 bigfile.log                # ALLOW — but memory-bound; the validator can't prevent OOM. Document as client-side risk.
```

### `grep`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Search text using patterns |
| **Safe flags** | `-c`, `-E`, `-F`, `-G`, `-H`, `-h`, `-i`, `-l`, `-L`, `-m`, `-n`, `-o`, `-q`, `-r`, `-s`, `-v`, `-w`, `-x`, `-A`, `-B`, `-C`, `--color`, `--exclude`, `--exclude-dir`, `--include`, `--max-count`, `--no-filename`, `--only-matching`, `--regexp` (use this for pattern input!), `--fixed-strings`, `--line-number`, `--count`, `--recursive`, `--context`, `--word-regexp`, `--line-regexp`, `--invert-match`, `--quiet` |
| **Dangerous flags** | `--binary` + `--text` (`-a`) can output binary content that chokes the terminal UI; `--null` / `-Z` emits NUL-separated output for piping to `xargs -0` — safe on its own but the output must not be piped to anything destructive on our end; `--label` (labels stdin output) no risk. **No grep flag can write files or execute code.** |
| **Validator regex** | `/^[a-zA-Z0-9_\-\/.@+=:]+$/` for paths; pattern argument must pass the pattern validation step below |
| **Pattern validation** | The pattern argument (first non-flag positional arg) is the highest injection surface. Validate: no newlines (`\n`, `\r`), no unescaped control characters, no shell metacharacters. A safe pattern regex: `/^[\x20-\x7E]+$/` — printable ASCII only. |
| **Injection surface** | **Massive.** `grep -r` can recursively search files including `/dev` and `/proc`. `--exclude-dir` can be used to probe directory existence. The `-f` flag (read patterns from file) could be weaponized: `grep -f /etc/shadow .` would try to read patterns from `/etc/shadow` (fails on permission but probes existence). |

**Reject examples:**
```
grep -r "" /var                               # REJECT — recursive search on /var is too broad
grep -r "password" /                         # REJECT — trying to read entire filesystem
grep -f /etc/shadow file.txt                 # REJECT — -f flag reads an arbitrary file
grep "some pattern" /dev/urandom             # REJECT — /dev/ path
grep -r --include="*.key" .                  # REJECT — pattern is trying to find private keys
grep $(whoami) file.txt                      # REJECT — metacharacters in pattern via $()
```

### `find`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Search for files in a directory hierarchy |
| **Safe flags/syntax** | `-name`, `-type`, `-size`, `-mtime`, `-atime`, `-ctime`, `-newer`, `-maxdepth`, `-mindepth`, `-empty`, `-not`, `-or`, `-and`, `-path`, `-ipath`, `-iname`, `-regex`, `-iregex`, `-printf` (with **extreme caution** — see below), `-fprintf`, `-fls` (blocked — writes to file) |
| **Dangerous flags** | **`-exec`** — executes a command on each match. **Blocked entirely.** `-execdir` — same, but from the file's directory. **Blocked entirely.** `-ok` — interactive `-exec`. **Blocked.** `-okdir` — blocked. `-delete` — deletes matched files. **Blocked.** `-fls file` — writes to file. **Blocked.** `-fprint file` — writes to file. **Blocked.** `-fprintf file` — writes formatted output to file. **Blocked.** `-printf` — prints to stdout only (safe for printing, but can be used for format-string attacks on the terminal output — restrict to known format specifiers). |
| **Validator regex** | `/^[a-zA-Z0-9_\-\/.@+=:]+$/` for paths; each flag token must be independently validated |
| **`-printf` format restriction** | Only allow: `%p`, `%f`, `%h`, `%s`, `%b`, `%k`, `%a`, `%t`, `%c`, `%Tk`, `%Y`, `%m`, `%M`, `%g`, `%u`, `%n`, `%%`, `\n`, `\t`. Block `%i` (inode), `%l` (symbolic link target that may leak). Block `\0` NUL). |
| **Injection surface** | `-exec` is the obvious one. `-printf %p` is safe. The larger risk is performance: `find /` or `find . -type f` with no `-maxdepth` can scan the entire filesystem and hang the terminal. |

**Reject examples:**
```
find . -exec rm {} \;                        # REJECT — -exec blocked
find . -execdir ls {} \;                     # REJECT — -execdir blocked
find . -delete                               # REJECT — -delete blocked
find . -fls /tmp/output.txt                  # REJECT — writes to file
find / -name "*.key"                         # REJECT — scanning / is too broad
find . -fprintf /etc/passwd "%p\n"           # REJECT — writes to file
```

### `wc`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Word, line, character, and byte count |
| **Safe flags** | `-l`, `-w`, `-c`, `-m`, `-L`, `--lines`, `--words`, `--bytes`, `--chars`, `--max-line-length`, `--files0-from=F` (with path restriction — reads from a NUL-delimited file) |
| **Dangerous flags** | `--files0-from` can be used to read paths from an arbitrary file — same risk as `grep -f`. **Blocked unless the file path is explicit and safe.** `-c` counting `/dev/zero` never terminates — blocked per `/dev/*` path rule. |
| **Validator regex** | `/^[a-zA-Z0-9_\-\/.@+=:]+$/` for paths; flag values as above |
| **Injection surface** | Minimal — `wc` cannot write files or execute code. The `/dev/*` infinite-read risk is the main concern. |

**Reject examples:**
```
wc -c /dev/zero                              # REJECT — never terminates
wc -l --files0-from=/etc/shadow              # REJECT — reads file as path source
```

### `tree`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Display directory structure as a tree |
| **Safe flags** | `-a`, `-d`, `-f`, `-h`, `-i`, `-L`, `-n`, `-o` (writes to a file — **blocked**), `-p`, `-s`, `-t`, `-u`, `-C`, `--dirsfirst`, `--filelimit`, `--timefmt`, `--sort` (with: `size`, `time`, `name`, `version`), `--prune`, `--charset` |
| **Dangerous flags** | `-o file` — writes output to a file. **Blocked.** `--fromfile` — reads a list of paths from a file. **Blocked.** `--inodes` — leaks inode numbers (minimal risk but unnecessary). |
| **Validator regex** | `/^[a-zA-Z0-9_\-\/.@+=:]+$/` for paths |
| **Injection surface** | `-o` file write is the only danger. `tree /` with no depth limit can output the entire filesystem — enforce a default `-L` limit of 3 unless the user explicitly sets one. |

**Reject examples:**
```
tree -o /tmp/output.txt                      # REJECT — writes to file
tree --fromfile /etc/passwd                  # REJECT — reads file as path list
tree /                                       # ALLOW only if -L is set; REJECT if no depth limit
```

---

## 2. Git Commands (Read-Only Subset)

Git commands are higher risk because git has more surface area for
argument injection. Each git subcommand must be individually validated.

### `git log`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Show commit logs |
| **Safe flags** | `--oneline`, `--format`, `--graph`, `--decorate`, `--all`, `--branches`, `--tags`, `--remotes`, `--since`, `--until`, `--author`, `--grep`, `-n`, `--max-count`, `--skip`, `--no-merges`, `--first-parent`, `--follow`, `--diff-filter`, `--name-only`, `--name-status`, `--abbrev-commit`, `--relative-date`, `--topo-order`, `--date` (with: `short`, `relative`, `iso`, `rfc`, `unix`), `--pretty`, `--after`, `--before`, `--committer`, `--merges`, `--stat`, `--shortstat`, `--summary`, `--reverse`, `--walk-reflogs` |
| **Dangerous flags** | **`--output=<file>`** — writes git log output to an arbitrary file. **Blocked.** `-c` (config override) — can change git behavior mid-execution. **Blocked.** `--config-env` — reads configuration from environment variable. **Blocked.** `--output-indicator` — controls output indicators; safe but track if extended. |
| **Validator regex** | For revision arguments (hash, ref): `/^[a-zA-Z0-9_\/\.\-]+$/` — only allow alphanumeric refs, slashes for branch paths, dots for ranges. **REJECT any argument starting with `--` that isn't in the safe list.** |
| **Injection surface** | **`--output=<file>`** is the highest-severity injection: if a malicious user passes this as a "revision" argument and the validator doesn't catch it, git overwrites an arbitrary file. `-c` (config override) can change git behavior. Refs with `..` (range notation) are safe if we validate the format. |

**Reject examples:**
```
git log --output=/etc/cron.d/pwn             # REJECT — writes to file
git log -c core.gitProxy=ssh://attacker.com  # REJECT — config override
git log --output-indicator                     # ALLOW
```

### `git status`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Show working tree status |
| **Safe flags** | `--short`, `--branch`, `--porcelain`, `--long`, `--ignored`, `--untracked-files` (with: `normal`, `all`, `no`), `--column`, `--ahead-behind`, `--renames` |
| **Dangerous flags** | None — `git status` cannot write files or execute code. However, `--porcelain` output can be parsed programmatically; ensure the output mode doesn't break the terminal rendering. |
| **Validator regex** | Standard path/flag validation |
| **Injection surface** | Negligible. Status is purely observational. |

### `git diff`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Show changes between commits, commit and working tree, etc. |
| **Safe flags** | `--staged`, `--cached`, `--name-only`, `--name-status`, `--stat`, `--shortstat`, `--patch`, `-U`, `--unified`, `--color`, `--no-color`, `--word-diff`, `--word-diff-regex`, `--ignore-space-change`, `--ignore-all-space`, `--ignore-blank-lines`, `--ignore-cr-at-eol`, `--no-renames`, `--rename-threshold`, `--diff-filter`, `--find-renames`, `--find-copies`, `--inter-hunk-context`, `--function-context`, `--src-prefix`, `--dst-prefix`, `--line-prefix`, `--no-index` |
| **Dangerous flags** | `--output=<file>` — writes diff to file. **Blocked.** `--textconv` — runs text conversion filters. **Blocked (can execute arbitrary commands via git config).** `--no-textconv` — safe (disables textconv). `--ext-diff` — runs external diff tool. **Blocked.** `--no-ext-diff` — safe. |
| **Validator regex** | Same as `git log`: reference validation, reject unknown `--` flags |
| **Injection surface** | `--textconv` and `--ext-diff` can trigger arbitrary command execution via configured git drivers. Same `--output` file write risk as `git log`. |

**Reject examples:**
```
git diff --output=/tmp/hacked.diff           # REJECT — writes to file
git diff --textconv HEAD~1 HEAD              # REJECT — executes textconv filters
git diff --ext-diff HEAD~1 HEAD              # REJECT — runs external diff tool
```

### `git show`

| Property | Detail |
| :--- | :--- |
| **Purpose** | Show various types of objects (commits, tags, blobs) |
| **Safe flags** | Same as `git log` + `--format`, `--pretty`, `--stat`, `--name-only`, `--name-status`, `--patch`, `-U`, `--no-patch`, `--format`, `--raw`, `--numstat`, `--shortstat`, `--summary`, `--check`, `--submodule` |
| **Dangerous flags** | **`--output=<file>`** — writes to file. **Blocked.** `--textconv` — blocked. `--ext-diff` — blocked. **Additionally:** `git show` can take a TREE:OBJECT path argument like `HEAD:path/to/file` which extracts a file from git history and prints it. This is a read-only operation (no write) but could expose sensitive content. **Allow the `:` syntax** — it's read-only and useful. |
| **Validator regex** | For object references (ref:path): `/^[a-zA-Z0-9_\/\.\-]+:[a-zA-Z0-9_\/\.\-]+$/` |
| **Injection surface** | Same as `git log` re: `--output`. The `:` syntax is safe (extracts file content to stdout). `git show` without arguments shows HEAD — safe. |

**Reject examples:**
```
git show --output=/tmp/hacked                # REJECT — writes to file
git show --textconv HEAD                     # REJECT — textconv execution
git show HEAD:.env                           # ALLOW — reads .env from git history (the content is already in git, this isn't new exposure)
```

### `git branch`

| Property | Detail |
| :--- | :--- |
| **Purpose** | List branches |
| **Safe flags** | `-a`, `-r`, `-l`, `-v`, `-vv`, `--all`, `--remotes`, `--verbose`, `--merged`, `--no-merged`, `--contains`, `--no-contains`, `--sort`, `--format`, `--column`, `--list`, `--points-at`, `--color`, `--no-color`, `--show-current` |
| **Dangerous flags** | `-d`, `-D` — delete branches. **Blocked.** `-m`, `-M` — rename/move branches. **Blocked.** `-c`, `-C` — copy branches. **Blocked.** `--edit-description` — opens editor. **Blocked.** `--set-upstream-to` — modifies upstream tracking. **Blocked.** `--unset-upstream` — removes upstream tracking. **Blocked.** `--track` — sets up tracking. **Blocked.** |
| **Validator regex** | Standard flag validation; reject any `-d`, `-D`, `-m`, `-M`, `-c`, `-C` flags |
| **Injection surface** | `-d/-D` deletion is the main risk. Branch names with special characters in the list argument are cosmetic only. |

**Reject examples:**
```
git branch -d feature/my-branch              # REJECT — deletion
git branch -m old new                        # REJECT — rename
git branch --set-upstream-to=origin/main     # REJECT — modifies config
git branch -a                                # ALLOW
git branch --show-current                    # ALLOW
```

---

## 3. Blocklist — Never Permitted

These commands are blocked for the reasons stated. No exceptions.

### File modification/deletion

| Command | Block reason (one sentence) |
| :--- | :--- |
| **`rm`** | Destroys files irreversibly — the terminal is read-only. |
| **`mv`** | Moves/renames files — modifies the filesystem state. |
| **`cp`** | Copies files — creates new files on the filesystem. |
| **`chmod`** | Changes file permissions — modifies filesystem security state. |
| **`chown`** | Changes file ownership — requires privileges no server should have. |
| **`mkdir` / `rmdir`** | Creates or destroys directories — filesystem mutation. |
| **`touch`** | Creates or updates file timestamps — filesystem mutation. |
| **`ln`** | Creates hard/symbolic links — filesystem mutation that can enable symlink-based privilege escalation. |
| **`dd`** | Low-level file copy with block-level access — can overwrite disks, partitions, or any writable path. |
| **`truncate` / `fallocate`** | Resizes files — filesystem mutation. |
| **`tee`** | Writes stdin to a file while also passing it to stdout — direct file write. |

### Network access

| Command | Block reason (one sentence) |
| :--- | :--- |
| **`curl`** | Makes arbitrary HTTP requests — enables SSRF, data exfiltration, and internal network probing. |
| **`wget`** | Downloads files from arbitrary URLs — same SSRF/exfiltration risk as curl, with added file write. |
| **`nc` / `netcat`** | Opens raw TCP/UDP connections — enables arbitrary network access, reverse shells, and port scanning. |
| **`ssh`** | Creates outbound SSH connections — enables lateral movement and persistent access. |
| **`scp` / `sftp`** | Transfers files over SSH — enables file exfiltration over encrypted channels. |
| **`telnet`** | Opens unencrypted network connections — enables port scanning and banner grabbing. |
| **`nslookup` / `dig` / `host`** | DNS queries — can be used for DNS-based data exfiltration (DNS tunneling). |
| **`ping`** | ICMP echo — can be used for ICMP-based data exfiltration and network reconnaissance. |
| **`nmap`** | Network scanner — enables full network reconnaissance, service detection, and OS fingerprinting. |

### Privilege escalation

| Command | Block reason (one sentence) |
| :--- | :--- |
| **`sudo`** | Escalates privileges — violates the principle of least privilege for the terminal process. |
| **`su`** | Switches user context — same privilege escalation risk as sudo. |
| **`chroot`** | Changes root directory — can escape container boundaries in misconfigured environments. |
| **`runuser` / `machinectl`** | Runs commands as another user — unauthorized privilege escalation. |
| **`pkexec`** | PolicyKit execution — escalates privileges through PolicyKit; has known CVEs. |


### Code execution / meta-commands

| Command | Block reason (one sentence) |
| :--- | :--- |
| **`eval`** | Executes an arbitrary string as shell code — defeats every other security control. |
| **`exec`** | Replaces the current process with a new one — can escape the terminal's execution sandbox. |
| **`source` / `.`** | Sources a script into the current shell — executes arbitrary shell commands from a file. |
| **`alias`** | Creates command aliases — can redefine allowed commands to execute malicious operations. |
| **`time`** (bash built-in) | The built-in `time` keyword runs its argument any allowed command is fine, but the POSIX `time` with format string is fine — document that the validator must verify it's used as `time <allowed_command>` and never `time; <malicious>`. |
| **`nohup`** | Runs a command immune to hangups — could keep a malicious process running after the terminal connection drops. |
| **`setsid`** | Runs a command in a new session — hides process from terminal management. |

### Package managers

| Command | Block reason (one sentence) |
| :--- | :--- |
| **`npm` / `pnpm` / `yarn`** | Installs arbitrary code from the npm registry — enables supply chain attacks via malicious packages. |
| **`pip` / `pip3`** | Installs arbitrary Python packages from PyPI — same supply chain risk. |
| **`apt` / `apt-get`** | Installs system packages — modifies the server's software environment. |
| **`brew`** | Installs packages via Homebrew — modifies system software state. |
| **`cargo` / `gem` / `go install`** | Installs language-specific packages — supply chain attack vector. |

### Shell metacharacters

These characters are NEVER allowed in any argument to any command.
They have special meaning in shell contexts and enable injection.

| Metacharacter | Name | Why blocked |
| :--- | :--- | :--- |
| **`;`** | Semicolon | Command separator — terminates the intended command and executes a new one. |
| **`&`** | Background | Command terminator — runs a command in the background, enabling concurrent malicious execution. |
| **`|`** | Pipe | Connects stdout of one command to stdin of another — enables chaining arbitrary commands. |
| **`` ` ``** | Backtick | Command substitution — executes the enclosed text as a command before the main command runs. |
| **`$()`** | Command substitution | Same as backticks but nestable — executes arbitrary commands, result replaces the expression. |
| **`${}`** | Variable substitution | Reads or executes shell variables and functions — can be used to execute code via `$()`. |
| **`()`** | Subshell | Runs commands in a subshell — enables grouping of arbitrary commands. |
| **`{}`** | Brace expansion / command grouping | Generates multiple arguments from a pattern; can also group commands with `;`. |
| **`<`** | Input redirection | Redirects a file into stdin — can read arbitrary files the process has access to. |
| **`>`** | Output redirection | Redirects stdout to a file — enables arbitrary file writes. |
| **`>>`** | Append redirection | Appends stdout to a file — enables arbitrary file appends. |
| **`<<`** | Here-document | Provides inline input to a command — can pass multi-line malicious input. |
| **`!`** | History expansion | References previous commands in interactive shells — can re-execute with modification. |
| **`~`** | Home directory expansion | Expands to the user's home directory — path traversal via user context. |
| **`*` `?` `[`** | Glob patterns | While not inherently dangerous, globs can enumerate unexpected files and cause massive argument expansion. Allowed only in path arguments where the validator can confirm the pattern is bounded (e.g., `*.txt` is fine, `**/*` is not). |
| **Newline (`\n`)** | Line feed | Terminates the current command and starts a new one — equivalent to `;` in most contexts. |
| **Carriage return (`\r`)** | Carriage return | Can obscure command text by overwriting the current line — enables visual deception attacks. |
| **Null byte (`\0`)** | NUL | Terminates strings in C — can truncate validation checks that pass the attacker's input. |

---

## 4. Injection Attack Patterns — 10 That Bypass Naive Allowlists

These are real attack patterns that a simple command-name allowlist
would miss. Each one works because the validator only checked "is the
command name in the allowlist?" without validating the arguments.

### Pattern 1: `;` command chaining

```
git log; rm -rf /
```

**How it bypasses a naive allowlist:** The validator sees `git` — an
allowed command — and passes the entire string to `exec()`. The shell
interprets the `;` as a command separator and runs `rm -rf /` after
`git log`.

**Defense:** Never use `exec()` or any shell-spawning function. Use
`execFile('git', ['log'])` which passes the entire string as a single
argument to git. Git sees `log; rm -rf /` as a malformed revision
argument and errors — it never reaches the shell.

### Pattern 2: Command substitution with `$()`

```
ls -la $(whoami)
```
```
cat /etc/passwd$(id)
```

**How it bypasses a naive allowlist:** The shell evaluates `$()` before
executing the command. `ls -la $(whoami)` first runs `whoami`, substitutes
the result, then runs `ls -la henry`.

**Defense:** Same as Pattern 1 — `execFile` doesn't spawn a shell, so
`$()` is never evaluated. The string `$(whoami)` is passed literally
to `ls` as a filename argument.

### Pattern 3: Backtick substitution

```
cat `find / -name "*.env"`
```

**How it bypasses a naive allowlist:** Backticks are equivalent to `$()`.
The shell executes the enclosed command and uses its output as arguments.
This reads every `.env` file on the filesystem.

**Defense:** `execFile` treats backticks as literal characters. Same
defense as Pattern 2. Additionally, reject any argument containing `` ` ``.

### Pattern 4: Newline injection

```
git status\nrm -rf /
```

**How it bypasses a naive allowlist:** The validator checks that
`git` is allowed and sees `status` as an argument. But a newline in the
middle of the command string creates a new command line. The shell reads
`git status`, then executes `rm -rf /` on the next line.

**Defense:** Validate each argument token as a complete unit. Reject any
argument containing `\n`, `\r`, or `\0`. Additionally, `execFile` passes
the entire string as a single argument — git wouldn't interpret the
newline as a separator.

### Pattern 5: Flag injection in revision arguments

```
git log --output=/etc/cron.d/malicious
```

**How it bypasses a naive allowlist:** The validator sees `git log` and
accepts it. The user provides `--output=/etc/cron.d/malicious` as a
"revision" argument. Git interprets it as a flag and writes the log
output to a cron directory.

**Defense:** Validate every argument that starts with `--` against a
per-command allowlist of safe flags. Any `--` argument that isn't in
the safe list for that command is rejected. For `git log`, `--output=*`
is explicitly dangerous.

### Pattern 6: Path traversal with sensitive file reads

```
cat ../../../../etc/passwd
```
```
grep -r "API_KEY" ~/.config
```

**How it bypasses a naive allowlist:** `cat` and `grep` are allowed
commands. But the path argument traverses out of the intended directory
to read sensitive system files or user configuration containing secrets.

**Defense:** Resolve paths to their canonical form before executing.
Reject any path that, after resolution, points outside the project
directory (or a designated safe directory). For `grep -r`, restrict the
search root to the project directory. Block `/dev/*`, `/proc/*`, `/sys/*`
paths entirely.

### Pattern 7: The `-f` file-read injection

```
grep -f /etc/shadow somefile
```
```
wc --files0-from=/proc/self/environ
```

**How it bypasses a naive allowlist:** The validator sees `grep` (allowed)
and checks the pattern argument. But `-f` tells grep to read patterns
from a file — the specified file is read and its contents are treated as
search patterns. This lets the attacker read arbitrary files through
grep's error messages or behavior.

**Defense:** Block `-f` and `--files0-from` for all commands. If a
command needs to read pattern files, only allow paths that pass the
same path validation as other file arguments.

### Pattern 8: Over-broad recursive search

```
grep -r "" /etc
```
```
find / -type f -name "*.conf"
```

**How it bypasses a naive allowlist:** Both commands are allowed. But
recursive search starting at `/etc` or `/` can enumerate every file on
the system, exposing the entire filesystem structure and reading
sensitive configuration files.

**Defense:** Limit recursive searches to the project directory. For
`find`, require a `-maxdepth` argument and enforce it. For `grep -r`,
reject paths outside the project root. Set a timeout on all commands
so even if a search is too broad, it terminates.

### Pattern 9: Arbitrary file write via `--output`

```
git diff --output=/tmp/backdoor
git show --output=/var/www/html/shell.php
git log --output=/home/user/.ssh/authorized_keys
```

**How it bypasses a naive allowlist:** `git` is allowed. The validator
sees `diff` or `log` or `show` — all allowed subcommands. But the
`--output=<file>` flag tells git to write its output to the specified
path, enabling arbitrary file write.

**Defense:** Block `--output=` for all git commands in the allowlist.
Separately, the server should run with minimal file permissions — even
if the validator misses this, the process shouldn't be able to write
to system directories.

### Pattern 10: Symlink/TOCTOU race condition

```
User submits: find . -name "*.log" -exec cat {} \;
The validator rejects it because -exec is blocked.

But what about:
find . -name "*.log" -type f
# Then, within the race window:
# (attacker swaps a directory for a symlink to /etc)
```

**How it bypasses a naive allowlist:** `find` with `-type f` is safe
on its own. But the time between `find` executing and the output being
consumed can be exploited. If the attacker can modify the filesystem
between the check and the read, they can trick the terminal into
reading different files than expected.

**Defense:** Use `find -L` cautiously (it follows symlinks). The
primary defense is process-level: the terminal process should run as a
low-privilege user that can't read `/etc/shadow` or write to system
directories regardless. TOCTOU is a systems-level concern that input
validation alone can't fully prevent — document it as accepted risk
in a sandboxed execution environment.

---

## 5. Validator Implementation Contract

The validator (built by Claude Code based on this doc) must implement
these checks, in order, before any command reaches `execFile`:

### Check order (short-circuit on first failure)

```
1. TOKENIZATION
   Split the input string into tokens on whitespace.
   Reject if any token matches a metacharacter regex:
   /[;&|`$(){}<>\n\r\0!~]/

2. COMMAND ALLOWLIST
   The first token must be in the COMMAND_ALLOWLIST.
   If not → REJECT with message: "Command not permitted: {cmd}"

3. GIT SUBCOMMAND VALIDATION (if command is 'git')
   The second token must be a permitted subcommand:
   log, status, diff, show, branch
   If not → REJECT: "Git subcommand not permitted: {subcommand}"
   Then apply per-subcommand flag allowlist from §2.

4. FLAG ALLOWLIST (per command)
   For each token starting with '-':
     Parse the flag name (strip leading dashes, strip =value)
     Check against the command's SAFE_FLAGS set.
     If not in SAFE_FLAGS → REJECT: "Flag not permitted: {flag}"

5. PATH VALIDATION
   For each positional argument that is a file path:
     If it contains '/dev/', '/proc/', '/sys/' → REJECT
     Resolve to canonical path. If outside PROJECT_ROOT → REJECT
     If path is not under PROJECT_ROOT after realpath() → REJECT

6. PATTERN VALIDATION (for grep, find -name, etc.)
     Regex patterns must match: /^[\x20-\x7E]+$/
     (printable ASCII only, no control chars, no metacharacters)

7. EXECUTION GATE
   Pass the validated command + validated arguments array to execFile.
   Never concatenate into a string. Use:
     execFile(cmd, validatedArgs, { timeout: 10000 })
   Set a 10-second timeout on all terminal commands.

8. OUTPUT FILTER (post-execution)
   Strip binary/null output before sending to the terminal UI.
   Cap output at 1MB per command (truncate with notice).
```

### Allowlist data structure (TypeScript pseudocode)

```typescript
const COMMAND_ALLOWLIST: Record<string, CommandConfig> = {
  ls: {
    safeFlags: new Set(['-1', '-a', '-A', '-C', '-d', ...]),
    allowGitSubcommands: false,
    pathValidation: true,
    forbiddenPaths: ['/dev', '/proc', '/sys'],
  },
  cat: {
    safeFlags: new Set(['-n', '-b', '-s', '-E', '-T', '-v', '-A', ...]),
    allowGitSubcommands: false,
    pathValidation: true,
    forbiddenPaths: ['/dev', '/proc', '/sys'],
  },
  git: {
    safeFlags: new Set([]), // git's own flags (-c, etc) are ALL blocked
    allowGitSubcommands: true,
    gitSubcommands: {
      log: { safeFlags: new Set(['--oneline', '--format', ...]) },
      status: { safeFlags: new Set(['--short', '--branch', '--porcelain', ...]) },
      diff: { safeFlags: new Set(['--staged', '--cached', '--name-only', ...]) },
      show: { safeFlags: new Set(['--format', '--pretty', '--stat', ...]) },
      branch: { safeFlags: new Set(['-a', '-r', '-v', '--all', ...]) },
    },
    pathValidation: true,
    forbiddenPaths: [],
  },
  // ... remaining commands
}
```

---

## 6. Execution Environment Requirements

The validator alone is not sufficient. The execution environment must
also enforce these constraints:

1. **No shell.** `execFile` only. Never `exec` or `spawn` with `{shell: true}`.
   This is the single most important defense.

2. **Timeout.** Every command times out after 10 seconds. The terminal
   shows a "Command timed out" message. No unbounded execution.

3. **Output cap.** Maximum 1MB of stdout per command. Beyond that,
   truncate and append "(truncated at 1MB)".

4. **Working directory.** Commands run from the project root directory.
   Path resolution uses `realpath()` to prevent `../` traversal.

5. **Minimal privileges.** The server process runs as a non-root user
   with write access only to the project's data directories. The
   terminal process inherits these permissions.

6. **No network access.** The terminal process should run with network
   sandboxing (e.g., `iptables` rules or container-level network
   restrictions) to prevent exfiltration and SSRF.

7. **Resource limits.** CPU limit (e.g., 1 core), memory limit (e.g.,
   256MB), and file descriptor limit (e.g., 100 fds) per command
   execution.

8. **Audit log.** Every command execution is logged server-side:
   `[terminal] user_command="ls -la" resolved="ls" args="[-la]" timestamp="..." user="..."`. This is for post-incident analysis, not for
   blocking.

---

## 7. Edge Cases and Ambiguities

### What about `--` the end-of-options marker?

`--` is safe. It tells the command that everything after it is a
positional argument, not a flag. The validator should explicitly allow
`--` as a token for any command.

```
ls -- -r          # Lists a file named "-r" — safe
grep -- "pattern" # Safe — pattern is treated as a literal even if it starts with -
```

### What about `-` as stdin?

A lone `-` as a file argument means "read from stdin" for many commands
(`cat -`, `grep pattern -`). This is safe but won't produce any output
in a non-interactive context — it will hang waiting for stdin. The
validator should reject `-` as a standalone path argument, or the
execution layer must not pipe stdin.

### What about environment variables in arguments?

Blocked by metacharacter validation. `${HOME}`, `$HOME`, `$PATH` all
contain `$` which is blocked.

### What about tilde expansion?

`~` in a path expands to the user's home directory. Blocked by
metacharacter validation.

### What about glob patterns?

`*.txt` and `file?.md` are shell features that depend on the shell.
Since we use `execFile` with no shell, these are passed literally as
arguments. The command itself (e.g., `ls`) may interpret `*` — but
`ls`'s own glob expansion is safe (it happens within `ls`, not the
shell). Allow literal `*`, `?`, `[` in path arguments — but only if
the pattern doesn't match blocked paths.

### What about chaining with `&&` or `||`?

Both contain metacharacters (`&` and `|`) and are blocked by the
metacharacter check. Additionally, `execFile` doesn't interpret them.

### What about `:(){ :|:& };:` (fork bomb)?

Blocked by metacharacter check (`()`, `|`, `&`, `;`, `{}`). Also
moot with `execFile` — the fork bomb is a shell function definition,
not a valid command.

---

## Quick Reference Card

```
┌─ ALLOWED COMMANDS ──────────────────────────────────────────────┐
│  ls cat head tail grep find wc tree                             │
│  git log git status git diff git show git branch                │
│                                                                  │
│  Per-command safe flags only. All others → REJECT.              │
└─────────────────────────────────────────────────────────────────┘

┌─ BLOCKED (always) ──────────────────────────────────────────────┐
│  FILE:  rm mv cp chmod chown mkdir rmdir touch ln dd tee       │
│  NET:   curl wget nc ssh scp sftp telnet nslookup dig ping     │
│  PRIV:  sudo su chroot runuser pkexec                          │
│  EXEC:  eval exec source alias nohup setsid                   │
│  PKG:   npm pnpm yarn pip apt brew cargo gem go install         │
└─────────────────────────────────────────────────────────────────┘

┌─ BLOCKED METACHARACTERS ────────────────────────────────────────┐
│  ;  &  |  `  $  (  )  {  <  >  !  ~  \n  \r  \0               │
│  All shell metacharacters rejected in ALL arguments.            │
└─────────────────────────────────────────────────────────────────┘

┌─ 10 INJECTION PATTERNS (and the one defense that stops them) ──┐
│  1.  ; chaining        →  execFile (no shell)                   │
│  2.  $() substitution   →  execFile (no shell)                  │
│  3.  `` backticks       →  execFile (no shell)                  │
│  4.  \n newline         →  execFile + token-level validation    │
│  5.  --flag injection   →  Per-command flag allowlist           │
│  6.  Path traversal     →  realpath() + PROJECT_ROOT check      │
│  7.  -f file read       →  Block -f/--files0-from flags         │
│  8.  Over-broad search  →  Path restrict + timeout              │
│  9.  --output write     →  Block --output= for all git commands │
│  10. TOCTOU symlink     →  Process-level permissions (not fixable│
│                           by validation alone — accepted risk   │
│                           in sandboxed environment)             │
└─────────────────────────────────────────────────────────────────┘
```
