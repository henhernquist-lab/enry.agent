'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, TerminalSquare } from 'lucide-react'

interface RepoOption {
  full_name: string
  default_branch: string
  private: boolean
}

interface Line {
  kind: 'command' | 'output' | 'system'
  repo?: string
  text: string
  exitCode?: number
}

const ALLOWED_HINT = 'ls · cat · head · tail · grep · find · wc · tree · git log/status/diff/show/branch'

export function LiveTerminal({ autoFocus = true }: { autoFocus?: boolean }) {
  const [repos, setRepos] = useState<RepoOption[]>([])
  const [repo, setRepo] = useState<string>('')
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [lines, setLines] = useState<Line[]>([
    { kind: 'system', text: 'enry terminal — read-only, sandboxed. Select a repo and run a command.' },
    { kind: 'system', text: `allowed: ${ALLOWED_HINT}` },
  ])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

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
    setRepoMenuOpen(false)
    inputRef.current?.focus()
  }, [])

  const run = useCallback(
    async (command: string) => {
      const trimmed = command.trim()
      if (!trimmed) return
      if (!repo) {
        setLines((l) => [...l, { kind: 'system', text: '⚠ select a repo first' }])
        return
      }
      history.current.push(trimmed)
      historyIdx.current = history.current.length
      setLines((l) => [...l, { kind: 'command', repo, text: trimmed }])
      setInput('')
      setRunning(true)

      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch('/api/terminal/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo, command: trimmed, session_id: sessionId }),
          signal: controller.signal,
        })
        const data = await res.json()
        if (data.session_id) setSessionId(data.session_id)
        const text = (data.output ?? data.error ?? '').toString()
        setLines((l) => [...l, { kind: 'output', text: text || '(no output)', exitCode: data.exit_code ?? 0 }])
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
    },
    [repo, sessionId],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+C — cancel running command or clear the current input line.
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault()
      if (running && abortRef.current) {
        abortRef.current.abort()
      } else if (input) {
        setLines((l) => [...l, { kind: 'command', repo, text: input + '^C' }])
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
                <span className="flex-shrink-0 text-primary">➜ {line.repo}</span>
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
          return (
            <pre
              key={i}
              className={`mb-1 whitespace-pre-wrap break-words ${line.exitCode && line.exitCode !== 0 ? 'text-red-400/90' : 'text-foreground/80'}`}
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
          <span className="flex-shrink-0 text-primary">➜ {repo}</span>
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
