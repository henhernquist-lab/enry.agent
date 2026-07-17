'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, TerminalSquare, GitBranch } from 'lucide-react'
import { DiffView } from './diff-view'

interface RepoOption {
  full_name: string
  default_branch: string
  private: boolean
}

type CommandAction = 'propose_edit' | 'apply' | 'branch' | 'commit' | 'pr'

interface Line {
  kind: 'command' | 'output' | 'system' | 'question'
  repo?: string
  branch?: string | null
  text: string
  exitCode?: number
  action?: CommandAction
  options?: string[]
}

const ALLOWED_HINT = 'ls · cat · head · tail · grep · find · wc · tree · git log/status/diff/show/branch'
const WRITE_HINT = 'edit <file> [instruction] · write <file> [instruction] · apply · branch <name> · commit "msg" · pr "title" "desc" — or just type what you want changed'

function promptLabel(repo?: string | null, branch?: string | null): string {
  return branch ? `➜ ${repo ?? ''} (${branch})` : `➜ ${repo ?? ''}`
}

export function LiveTerminal({ autoFocus = true }: { autoFocus?: boolean }) {
  const [repos, setRepos] = useState<RepoOption[]>([])
  const [repo, setRepo] = useState<string>('')
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [lines, setLines] = useState<Line[]>([
    { kind: 'system', text: 'enry terminal — sandboxed coding agent. Select a repo and run a command.' },
    { kind: 'system', text: `read: ${ALLOWED_HINT}` },
    { kind: 'system', text: `write: ${WRITE_HINT}` },
    { kind: 'system', text: 'edit/write always show a diff first — nothing writes to disk until you type apply. Changes never touch main directly.' },
  ])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [hasPendingDiff, setHasPendingDiff] = useState(false)

  const history = useRef<string[]>([])
  const historyIdx = useRef<number>(-1)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const repoMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/terminal/repos')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.repos ?? []) as RepoOption[]
        setRepos(list)
        if (list.length && !repo) setRepo(list[0].full_name)
        if (d.error) setLines((l) => [...l, { kind: 'system', text: `⚠ ${d.error}` }])
      })
      .catch(() => setLines((l) => [...l, { kind: 'system', text: '⚠ could not load repos' }]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Click-outside close for the repo menu (dark-matrix UI convention).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (repoMenuRef.current && !repoMenuRef.current.contains(e.target as Node)) setRepoMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  // Switching repos starts a fresh session so each terminal_session logs a
  // single repo. Done at the change site, not in an effect.
  const selectRepo = useCallback((full: string) => {
    setRepo(full)
    setSessionId(null)
    setCurrentBranch(null)
    setHasPendingDiff(false)
    setRepoMenuOpen(false)
    inputRef.current?.focus()
  }, [])

  // A plain function declaration, not useCallback — the auto-mode NL-edit chain
  // below calls run() recursively for its hop-2 re-POST, which would be a TDZ
  // hazard against a `const` bound via useCallback (same fix already applied to
  // agent/page.tsx's exec()). Recreated every render; harmless, nothing depends
  // on run's identity being stable.
  async function run(
    command: string,
    opts?: { proceed?: boolean; targetFile?: string; isNewFile?: boolean; instruction?: string; chainDepth?: number },
  ) {
      const trimmed = command.trim()
      if (!trimmed) return
      if (!repo) {
        setLines((l) => [...l, { kind: 'system', text: '⚠ select a repo first' }])
        return
      }
      const isChainHop = (opts?.chainDepth ?? 0) > 0
      if (!isChainHop) {
        history.current.push(trimmed)
        historyIdx.current = history.current.length
        setLines((l) => [...l, { kind: 'command', repo, branch: currentBranch, text: trimmed }])
        setInput('')
      }
      setRunning(true)

      const controller = new AbortController()
      abortRef.current = controller
      try {
        const body: Record<string, unknown> = { repo, command: trimmed, session_id: sessionId, proceed: opts?.proceed ?? false }
        if (opts?.targetFile) body.target_file = opts.targetFile
        if (opts?.isNewFile !== undefined) body.is_new_file = opts.isNewFile
        if (opts?.instruction) body.instruction = opts.instruction

        const res = await fetch('/api/terminal/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        const data = await res.json()
        if (data.session_id) setSessionId(data.session_id)
        setCurrentBranch(data.current_branch ?? null)
        setHasPendingDiff(!!data.has_pending_diff)

        // Auto-mode NL edits classify the target and stop there (see
        // /api/terminal/exec's dispatch()) so classification and full-file
        // generation get separate maxDuration budgets. Chain the follow-up
        // request invisibly — same pattern as agent/page.tsx's exec(). Capped
        // at one hop so a server bug can't loop this forever.
        if (data.action === 'target_resolved' && (opts?.chainDepth ?? 0) < 1) {
          await run(command, {
            proceed: true,
            targetFile: data.target_file,
            isNewFile: data.is_new_file,
            instruction: opts?.instruction ?? command,
            chainDepth: (opts?.chainDepth ?? 0) + 1,
          })
          return
        }

        const text = (data.output ?? data.error ?? '').toString()

        // Ambiguous NL-edit requests come back as a [CLARIFY]/exit_code:0
        // marker (see nl-edit.ts's classify step) instead of a hard refusal —
        // render it as a question with clickable options instead of plain text.
        const clarifyMatch = text.match(/\[CLARIFY\]\s*([\s\S]*?)Options:\s*([\s\S]*)$/i)
        if (clarifyMatch && data.exit_code === 0 && !data.action) {
          const questionText = clarifyMatch[1].trim()
          const options = clarifyMatch[2].trim()
            .split(/(?:^|\s*,\s*)[A-Z]\)\s*/)
            .filter(Boolean)
            .map((o: string) => o.trim())
          setLines((l) => [...l, { kind: 'question', text: questionText, options }])
          return
        }

        setLines((l) => [...l, { kind: 'output', text: text || '(no output)', exitCode: data.exit_code ?? 0, action: data.action }])
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          setLines((l) => [...l, { kind: 'system', text: '^C (cancelled)' }])
        } else {
          setLines((l) => [...l, { kind: 'output', text: 'network error', exitCode: 1 }])
        }
      } finally {
        setRunning(false)
        abortRef.current = null
      }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+C — cancel running command or clear the current input line.
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault()
      if (running && abortRef.current) {
        abortRef.current.abort()
      } else if (input) {
        setLines((l) => [...l, { kind: 'command', repo, branch: currentBranch, text: input + '^C' }])
        setInput('')
      }
      return
    }
    // Ctrl+L — clear screen.
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault()
      setLines([])
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!running) run(input)
      return
    }
    // Command history (up/down).
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.current.length === 0) return
      historyIdx.current = Math.max(0, historyIdx.current - 1)
      setInput(history.current[historyIdx.current] ?? '')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (history.current.length === 0) return
      historyIdx.current = Math.min(history.current.length, historyIdx.current + 1)
      setInput(history.current[historyIdx.current] ?? '')
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-[#0a0a0a] font-mono text-[13px]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-surface-secondary px-3 py-2">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">live terminal</span>
          {currentBranch && (
            <span className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
              <GitBranch className="h-2.5 w-2.5" />
              {currentBranch}
            </span>
          )}
          {hasPendingDiff && (
            <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-warning">
              pending diff
            </span>
          )}
        </div>
        <div ref={repoMenuRef} className="relative">
          <button
            onClick={() => setRepoMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded border border-border bg-surface-base px-2 py-1 text-[11px] text-foreground transition-colors hover:border-primary/40"
          >
            {repo || 'select repo'}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
          {repoMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded border border-border bg-surface-elevated shadow-xl">
              {repos.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">no repos</div>
              ) : (
                repos.map((r) => (
                  <button
                    key={r.full_name}
                    onClick={() => selectRepo(r.full_name)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-surface-secondary ${
                      r.full_name === repo ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    <span className="truncate">{r.full_name}</span>
                    {r.private && <span className="ml-2 text-[9px] text-muted-foreground">private</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scrollback */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 leading-relaxed"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((line, i) => {
          if (line.kind === 'command') {
            return (
              <div key={i} className="flex gap-2 whitespace-pre-wrap break-all">
                <span className="flex-shrink-0 text-primary">{promptLabel(line.repo, line.branch)}</span>
                <span className="text-foreground">{line.text}</span>
              </div>
            )
          }
          if (line.kind === 'system') {
            return (
              <div key={i} className="whitespace-pre-wrap break-words text-muted-foreground">
                {line.text}
              </div>
            )
          }
          if (line.kind === 'question') {
            return (
              <div key={i} className="mb-2">
                <div className="whitespace-pre-wrap break-words text-accent">{line.text}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(line.options ?? []).map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setInput(opt); inputRef.current?.focus() }}
                      className="rounded border border-accent/30 bg-accent/5 px-2 py-0.5 text-[11px] text-accent transition-colors hover:bg-accent/10"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )
          }

          const isFailure = !!line.exitCode && line.exitCode !== 0
          if (line.action === 'propose_edit' && !isFailure) {
            return (
              <div key={i} className="mb-2">
                <DiffView diffText={line.text} />
                <div className="mt-1 inline-flex items-center gap-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-warning">
                  proposed, not applied — type <span className="font-semibold">apply</span> to write
                </div>
              </div>
            )
          }
          if (line.action === 'apply' && !isFailure) {
            return (
              <div key={i} className="mb-2 flex items-center gap-1.5 text-primary">
                <span>✓</span>
                <span className="whitespace-pre-wrap break-words">{line.text}</span>
              </div>
            )
          }

          return (
            <pre
              key={i}
              className={`mb-1 whitespace-pre-wrap break-words ${isFailure ? 'text-red-400/90' : 'text-foreground/80'}`}
            >
              {line.text}
            </pre>
          )
        })}
        {running && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> running… (Ctrl+C to cancel)
          </div>
        )}

        {/* Input line */}
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0 text-primary">{promptLabel(repo, currentBranch)}</span>
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="flex-1 border-none bg-transparent text-foreground caret-primary outline-none"
            placeholder={running ? '' : 'type a command…'}
            disabled={running}
          />
        </div>
      </div>
    </div>
  )
}
