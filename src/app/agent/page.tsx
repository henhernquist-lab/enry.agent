'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft, ChevronDown, Check, X, Send, Loader2,
  GitBranch, Folder, File, Lock, Sliders, Zap, TerminalSquare,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────

interface RepoOption {
  full_name: string
  default_branch: string
  private: boolean
}

type ChatLine =
  | { kind: 'prompt'; text: string }
  | { kind: 'system'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'proposal'; file: string; diff: string; isNewFile: boolean }
  | { kind: 'applied'; text: string }
  | { kind: 'committed'; text: string }
  | { kind: 'pr'; text: string }
  | { kind: 'error'; text: string }

// ─── Model definitions ──────────────────────────────────────

const MODELS = [
  { id: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro',  desc: 'Strongest free model. Best for complex tasks.' },
  { id: 'minimax/minimax-m3',          label: 'MiniMax M3',        desc: 'Fast and capable. Great for general tasks.' },
  { id: 'qwen/qwen3.5-122b-a10b',      label: 'Qwen 3.5 122B',    desc: 'Large reasoning model. Great for analysis.' },
  { id: 'z-ai/glm-5.2',                label: 'GLM 5.2',          desc: 'Versatile all-rounder. Good at following instructions.' },
] as const

const EFFORTS = [
  { id: 'none' as const,    label: 'Auto',     desc: 'Default reasoning' },
  { id: 'low' as const,     label: 'Quick',    desc: 'Minimal reasoning, fast' },
  { id: 'medium' as const,  label: 'Balanced', desc: 'Moderate reasoning depth' },
  { id: 'high' as const,    label: 'Deep',     desc: 'Maximum reasoning, slower' },
]

// ─── Diff block with line numbers ───────────────────────────

function DiffBlock({ diffText }: { diffText: string }) {
  const lines = diffText.split('\n')
  const fileLine = lines.find((l) => l.startsWith('+++ ') || l.startsWith('--- '))
  const fileName = fileLine
    ? fileLine.replace(/^(\+\+\+ |--- )/, '').replace(/^[ab]\//, '')
    : null

  let adds = 0
  let dels = 0
  for (const l of lines) {
    if (l.startsWith('+') && !l.startsWith('+++')) adds++
    else if (l.startsWith('-') && !l.startsWith('---')) dels++
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      {fileName && (
        <div className="flex items-center justify-between border-b border-border bg-surface-secondary px-3 py-1.5">
          <span className="font-mono text-[11px] text-foreground">{fileName}</span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            <span className="text-primary">+{adds}</span>
            {' '}
            <span className="text-destructive">{'\u2212'}{dels}</span>
          </span>
        </div>
      )}
      <div className="overflow-x-auto bg-[#080808] text-[12px] leading-[1.6]">
        {lines.map((line, i) => {
          let bg = ''
          let fg = 'text-muted-foreground'

          if (line.startsWith('+++') || line.startsWith('---')) {
            fg = 'text-muted-foreground/50'
          } else if (line.startsWith('@@')) {
            bg = 'bg-accent/5'
            fg = 'text-accent'
          } else if (line.startsWith('+')) {
            bg = 'bg-primary/5'
            fg = 'text-primary'
          } else if (line.startsWith('-')) {
            bg = 'bg-destructive/5'
            fg = 'text-destructive'
          } else {
            fg = 'text-foreground/70'
          }

          return (
            <div key={i} className={`flex ${bg}`}>
              <span className="inline-block w-[44px] flex-shrink-0 select-none border-r border-border/30 px-2 text-right font-mono text-[10px] tabular-nums text-muted-foreground/40">
                {i + 1}
              </span>
              <span className={`whitespace-pre px-3 font-mono ${fg}`}>
                {line || ' '}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page component ─────────────────────────────────────────

export default function AgentPage() {
  const { status } = useSession()
  const router = useRouter()

  const [repos, setRepos] = useState<RepoOption[]>([])
  const [repo, setRepo] = useState<string>('')
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [model, setModel] = useState<string>(MODELS[0].id)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [effort, setEffort] = useState<typeof EFFORTS[number]['id']>('none')
  const [effortMenuOpen, setEffortMenuOpen] = useState(false)
  const [lines, setLines] = useState<ChatLine[]>([
    { kind: 'system', text: 'coding agent \u2014 select a repository to begin. describe what you want to change in natural language.' },
  ])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [hasPendingDiff, setHasPendingDiff] = useState(false)
  const [thinkingCollapsed, setThinkingCollapsed] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const repoMenuRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const effortMenuRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auth guard
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // Load repos
  useEffect(() => {
    fetch('/api/terminal/repos')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.repos ?? []) as RepoOption[]
        setRepos(list)
        if (list.length && !repo) setRepo(list[0].full_name)
        if (d.error) setLines((l) => [...l, { kind: 'system', text: `GitHub: ${d.error}` }])
      })
      .catch(() => setLines((l) => [...l, { kind: 'system', text: 'could not load repositories' }]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close menus on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (repoMenuRef.current && !repoMenuRef.current.contains(e.target as Node)) setRepoMenuOpen(false)
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelMenuOpen(false)
      if (effortMenuRef.current && !effortMenuRef.current.contains(e.target as Node)) setEffortMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  const selectedRepo = repos.find((r) => r.full_name === repo)
  const currentModel = MODELS.find((m) => m.id === model)
  const currentEffort = EFFORTS.find((e) => e.id === effort)

  const selectRepo = useCallback((full: string) => {
    setRepo(full)
    setSessionId(null)
    setCurrentBranch(null)
    setHasPendingDiff(false)
    setRepoMenuOpen(false)
    setLines([{ kind: 'system', text: `selected ${full}. describe what you want to change.` }])
    inputRef.current?.focus()
  }, [])

  const exec = useCallback(
    async (command: string) => {
      if (!repo) {
        setLines((l) => [...l, { kind: 'system', text: 'select a repository first' }])
        return
      }
      setRunning(true)
      setThinkingCollapsed(false)
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch('/api/terminal/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo, command, session_id: sessionId, model }),
          signal: controller.signal,
        })
        const data = await res.json()
        if (data.session_id) setSessionId(data.session_id)
        setCurrentBranch(data.current_branch ?? null)
        setHasPendingDiff(!!data.has_pending_diff)

        const text = (data.output ?? data.error ?? '').toString()
        const action = data.action

        if (action === 'propose_edit' && data.exit_code === 0) {
          const fileMatch = text.match(/^([^:]+):/m)
          const file = fileMatch ? fileMatch[1].trim() : 'unknown'
          setLines((l) => [...l, { kind: 'proposal', file, diff: text, isNewFile: text.includes('new file') }])
        } else if (action === 'apply' && data.exit_code === 0) {
          setLines((l) => [...l, { kind: 'applied', text: text || 'Changes applied to working copy' }])
        } else if (action === 'commit' && data.exit_code === 0) {
          setLines((l) => [...l, { kind: 'committed', text: text }])
          setHasPendingDiff(false)
        } else if (action === 'pr' && data.exit_code === 0) {
          setLines((l) => [...l, { kind: 'pr', text: text }])
        } else if (data.exit_code !== 0) {
          setLines((l) => [...l, { kind: 'error', text: text || 'command failed' }])
        } else {
          setLines((l) => [...l, { kind: 'system', text: text || '(done)' }])
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          setLines((l) => [...l, { kind: 'system', text: 'Cancelled' }])
        } else {
          setLines((l) => [...l, { kind: 'error', text: 'Network error \u2014 retry' }])
        }
      } finally {
        setRunning(false)
        abortRef.current = null
      }
    },
    [repo, sessionId, model],
  )

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || running) return
    setLines((l) => [...l, { kind: 'prompt', text }])
    setInput('')
    exec(text)
  }, [input, running, exec])

  const handleQuickAction = (action: string) => {
    if (running) return
    exec(action)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const discardProposal = (idx: number) => {
    setLines((l) => l.filter((_, j) => j !== idx))
  }

  const isLoading = status === 'loading'

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasRepo = !!repo

  return (
    <div className="flex h-screen flex-col bg-background font-sans">
      {/* Top bar */}
      <header className="flex h-10 flex-shrink-0 items-center gap-3 border-b border-border bg-background px-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Home
        </Link>

        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
          Coding Agent
        </span>

        <div className="ml-auto flex items-center gap-3">
          {currentBranch && (
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              {currentBranch}
              {hasPendingDiff && (
                <span className="text-warning">*</span>
              )}
            </span>
          )}
          {hasPendingDiff && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-warning">
              Pending diff
            </span>
          )}

          <Link
            href="/resources/terminal"
            className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <TerminalSquare className="h-3 w-3" />
            Shell
          </Link>
        </div>

        {/* Repo selector */}
        <div ref={repoMenuRef} className="relative">
          <button
            onClick={() => setRepoMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded border border-border bg-surface-secondary px-2.5 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-primary/30"
          >
            {hasRepo ? (
              <>
                {selectedRepo?.private && <Lock className="h-2.5 w-2.5 text-muted-foreground" />}
                {repo}
              </>
            ) : (
              <span className="text-muted-foreground">Select repository</span>
            )}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>

          <AnimatePresence>
            {repoMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full z-30 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-border bg-surface-elevated shadow-lg"
              >
                {repos.length === 0 ? (
                  <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">No repositories</div>
                ) : (
                  repos.map((r) => (
                    <button
                      key={r.full_name}
                      onClick={() => selectRepo(r.full_name)}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-surface-secondary ${
                        r.full_name === repo ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      <span className="truncate">{r.full_name}</span>
                      <span className="ml-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                        {r.private && <Lock className="h-2.5 w-2.5" />}
                        {r.default_branch}
                      </span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Body: sidebar + conversation */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-[240px] flex-shrink-0 flex-col border-r border-border bg-[#0a0b0d]">
          {/* Repo info */}
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-1.5">
              <Folder className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Repository
              </span>
            </div>
            {hasRepo ? (
              <div className="mt-2 space-y-1">
                <p className="truncate font-mono text-[11px] text-foreground">{repo}</p>
                <p className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <GitBranch className="h-2.5 w-2.5" />
                  {currentBranch ?? selectedRepo?.default_branch ?? 'main'}
                  {hasPendingDiff && (
                    <span className="font-semibold text-warning">*</span>
                  )}
                </p>
              </div>
            ) : (
              <p className="mt-2 font-mono text-[10px] text-muted-foreground/60">
                No repository selected
              </p>
            )}
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto p-3 scrollbar-hidden">
            <div className="flex items-center gap-1.5">
              <File className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Files
              </span>
            </div>

            {hasRepo ? (
              <div className="mt-2 space-y-0.5">
                <p className="font-mono text-[10px] text-muted-foreground/60 pl-3">
                  Working copy
                </p>
                {['README.md', 'package.json', 'tsconfig.json', 'src/', 'src/app/', 'src/lib/'].map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-surface-secondary"
                  >
                    {f.endsWith('/') ? (
                      <Folder className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
                    ) : (
                      <File className="h-3 w-3 flex-shrink-0 text-muted-foreground/40" />
                    )}
                    <span className="truncate">{f}</span>
                  </div>
                ))}
                <p className="pt-2 font-mono text-[9px] italic text-muted-foreground/40 pl-3">
                  Describe changes in natural language &mdash; the agent navigates the codebase
                </p>
              </div>
            ) : (
              <p className="mt-3 pl-3 font-mono text-[10px] text-muted-foreground/50 leading-relaxed">
                Select a repository to browse its files and start coding.
              </p>
            )}
          </div>
        </aside>

        {/* Conversation area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto scrollbar-hidden"
          >
            <div className="mx-auto max-w-[720px] px-8 py-6">
              {lines.map((line, i) => {
                if (line.kind === 'system') {
                  return (
                    <div key={i} className="mb-3">
                      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground/60">
                        {line.text}
                      </p>
                    </div>
                  )
                }

                if (line.kind === 'prompt') {
                  return (
                    <div key={i} className="mb-6">
                      <div className="border-l-2 border-primary/40 pl-4">
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
                          You
                        </div>
                        <p className="font-sans text-[14px] leading-relaxed text-foreground">
                          {line.text}
                        </p>
                      </div>
                    </div>
                  )
                }

                if (line.kind === 'error') {
                  return (
                    <div key={i} className="mb-4">
                      <div className="border-l-2 border-destructive/40 pl-4">
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-destructive/60">
                          Error
                        </div>
                        <p className="font-mono text-[12px] leading-relaxed text-destructive">
                          {line.text}
                        </p>
                      </div>
                    </div>
                  )
                }

                if (line.kind === 'thinking') {
                  return (
                    <div key={i} className="mb-3">
                      <button
                        onClick={() => setThinkingCollapsed((v) => !v)}
                        className="mb-1 flex items-center gap-1 font-mono text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                      >
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${thinkingCollapsed ? '-rotate-90' : ''}`}
                        />
                        Thinking
                      </button>
                      {!thinkingCollapsed && (
                        <p className="border-l-2 border-border pl-3 font-mono text-[11px] leading-relaxed text-muted-foreground/50">
                          {line.text}
                        </p>
                      )}
                    </div>
                  )
                }

                if (line.kind === 'proposal') {
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mb-6"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-warning">
                            Proposed change
                          </span>
                          {line.isNewFile && (
                            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                              New file
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => discardProposal(i)}
                            className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                            Discard
                          </button>
                          <button
                            onClick={() => handleQuickAction('apply')}
                            disabled={running}
                            className="flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                          >
                            <Check className="h-3 w-3" />
                            Apply
                          </button>
                        </div>
                      </div>

                      <DiffBlock diffText={line.diff} />
                    </motion.div>
                  )
                }

                if (line.kind === 'applied') {
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="mb-4"
                    >
                      <div className="border-l-2 border-primary/30 pl-4">
                        <div className="mb-1 flex items-center gap-1.5">
                          <Check className="h-3 w-3 text-primary" />
                          <span className="font-mono text-[10px] uppercase tracking-wider text-primary/70">
                            Applied
                          </span>
                        </div>
                        <p className="font-mono text-[12px] leading-relaxed text-muted-foreground">
                          {line.text}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => handleQuickAction('commit "apply proposed changes"')}
                            disabled={running}
                            className="rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-40"
                          >
                            Commit
                          </button>
                          <button
                            onClick={() => handleQuickAction('pr "Proposed changes" "Auto-generated by enry coding agent"')}
                            disabled={running}
                            className="rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-40"
                          >
                            Create PR
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                }

                if (line.kind === 'committed') {
                  return (
                    <div key={i} className="mb-4">
                      <div className="border-l-2 border-primary/20 pl-4">
                        <div className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-primary/50">
                          Committed
                        </div>
                        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                          {line.text}
                        </p>
                      </div>
                    </div>
                  )
                }

                if (line.kind === 'pr') {
                  return (
                    <div key={i} className="mb-4">
                      <div className="border-l-2 border-primary/20 pl-4">
                        <div className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-primary/50">
                          Pull Request
                        </div>
                        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                          {line.text}
                        </p>
                      </div>
                    </div>
                  )
                }

                return null
              })}

              {/* Live thinking indicator */}
              <AnimatePresence>
                {running && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mb-4"
                  >
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
                      <span className="font-mono text-[11px] text-muted-foreground/40">
                        thinking
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Command bar */}
          <div className="flex-shrink-0 border-t border-border bg-background px-4 py-3">
            <div className="mx-auto max-w-[720px]">
              <div className="flex items-end gap-2">
                {/* Model picker */}
                <div ref={modelMenuRef} className="relative flex-shrink-0">
                  <button
                    onClick={() => setModelMenuOpen((o) => !o)}
                    className="flex items-center gap-1 rounded border border-border bg-surface-secondary px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  >
                    <Sliders className="h-3 w-3" />
                    {currentModel?.label}
                    <ChevronDown className="h-2.5 w-2.5" />
                  </button>

                  <AnimatePresence>
                    {modelMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute bottom-full left-0 z-20 mb-1 w-52 rounded-md border border-border bg-surface-elevated shadow-lg"
                      >
                        {MODELS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => { setModel(m.id); setModelMenuOpen(false); inputRef.current?.focus() }}
                            className={`flex w-full flex-col px-3 py-1.5 text-left transition-colors hover:bg-surface-secondary ${
                              model === m.id ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            <span className="font-mono text-[10px] font-semibold">{m.label}</span>
                            <span className="font-sans text-[9px] text-muted-foreground">{m.desc}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Effort toggle */}
                <div ref={effortMenuRef} className="relative flex-shrink-0">
                  <button
                    onClick={() => setEffortMenuOpen((o) => !o)}
                    className="flex items-center gap-1 rounded border border-border bg-surface-secondary px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  >
                    <Zap className="h-3 w-3" />
                    {currentEffort?.label}
                    <ChevronDown className="h-2.5 w-2.5" />
                  </button>

                  <AnimatePresence>
                    {effortMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute bottom-full left-0 z-20 mb-1 w-40 rounded-md border border-border bg-surface-elevated shadow-lg"
                      >
                        {EFFORTS.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => { setEffort(e.id); setEffortMenuOpen(false); inputRef.current?.focus() }}
                            className={`flex w-full flex-col px-3 py-1.5 text-left transition-colors hover:bg-surface-secondary ${
                              effort === e.id ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            <span className="font-mono text-[10px] font-semibold">{e.label}</span>
                            <span className="font-sans text-[9px] text-muted-foreground">{e.desc}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Input */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={hasRepo ? 'Describe what you want changed\u2026' : 'Select a repository above to begin'}
                  rows={1}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  disabled={running || !hasRepo}
                  className="flex-1 resize-none rounded border border-border bg-surface-secondary px-3 py-1.5 font-mono text-[13px] leading-relaxed text-foreground placeholder-muted-foreground/40 focus:border-primary/30 focus:outline-none disabled:opacity-40"
                  style={{ maxHeight: '120px' }}
                />

                {/* Send */}
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || running || !hasRepo}
                  className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded border border-border bg-surface-secondary text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-30"
                >
                  {running ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>

              <div className="mt-1.5 flex items-center gap-3">
                <p className="font-mono text-[9px] text-muted-foreground/40">
                  <kbd className="rounded border border-border/50 bg-surface-secondary px-1 py-0.5 font-mono text-[8px]">
                    Enter
                  </kbd>
                  {' '}send{' \u00b7 '}
                  <kbd className="rounded border border-border/50 bg-surface-secondary px-1 py-0.5 font-mono text-[8px]">
                    Shift+Enter
                  </kbd>
                  {' '}newline
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
