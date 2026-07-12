'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ChevronDown, ChevronRight, GitBranch, Loader2, Cpu, Gauge,
  Check, X, CornerDownLeft, Folder, FileCode, Terminal as TerminalIcon,
  Sparkles, GitCommit, GitPullRequest, AlertTriangle,
} from 'lucide-react'
import { DiffView } from '@/components/terminal/diff-view'

// ── Config ───────────────────────────────────────────────────────────────────
interface RepoOption { full_name: string; default_branch: string; private: boolean }

const MODELS = [
  { id: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro', hint: 'strongest · complex work' },
  { id: 'minimax/minimax-m3',          label: 'MiniMax M3',       hint: 'fast · general' },
  { id: 'qwen/qwen3.5-122b-a10b',      label: 'Qwen 3.5 122B',    hint: 'large · analysis' },
  { id: 'z-ai/glm-5.2',                label: 'GLM 5.2',          hint: 'versatile · instructions' },
] as const

// Fast / Balanced / Thorough map to the backend effort tiers (low/medium/high).
const EFFORTS = [
  { id: 'low',    label: 'Fast' },
  { id: 'medium', label: 'Balanced' },
  { id: 'high',   label: 'Thorough' },
] as const
type EffortId = (typeof EFFORTS)[number]['id']

const SLASH_COMMANDS = [
  { cmd: 'edit',   template: 'edit ',              hint: 'edit <file> [instruction] — propose a change to a file' },
  { cmd: 'write',  template: 'write ',             hint: 'write <file> [instruction] — propose a new file' },
  { cmd: 'apply',  template: 'apply',              hint: 'write the pending diff to the working copy' },
  { cmd: 'branch', template: 'branch ',            hint: 'branch <name> — create/switch a working branch' },
  { cmd: 'commit', template: 'commit "message"',   hint: 'commit the applied changes' },
  { cmd: 'pr',     template: 'pr "title" "desc"',  hint: 'open a pull request into the default branch' },
  { cmd: 'shell',  template: '',                   hint: 'raw shell: ls · cat · grep · find · git log …' },
] as const

// ── Message model ────────────────────────────────────────────────────────────
type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'system'; text: string }
  | { id: string; role: 'agent'; kind: 'text'; text: string }
  | { id: string; role: 'agent'; kind: 'output'; text: string }
  | { id: string; role: 'agent'; kind: 'error'; text: string }
  | { id: string; role: 'agent'; kind: 'proposal'; file: string; diff: string; reasoning: string; isNewFile: boolean; state: 'pending' | 'applied' | 'discarded' }
  | { id: string; role: 'agent'; kind: 'commit'; text: string }
  | { id: string; role: 'agent'; kind: 'pr'; text: string }

const uid = () => Math.random().toString(36).slice(2)

// ── Cockpit ──────────────────────────────────────────────────────────────────
export function AgentCockpit() {
  const [repos, setRepos] = useState<RepoOption[]>([])
  const [repo, setRepo] = useState('')
  const [repoMenu, setRepoMenu] = useState(false)
  const [model, setModel] = useState<string>(MODELS[0].id)
  const [modelMenu, setModelMenu] = useState(false)
  const [effort, setEffort] = useState<EffortId>('medium')
  const [tree, setTree] = useState<string[]>([])
  const [treeLoading, setTreeLoading] = useState(false)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [branch, setBranch] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [reposError, setReposError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const repoMenuRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const push = useCallback((m: Message) => setMessages((prev) => [...prev, m]), [])

  const loadTree = useCallback((full: string, br: string) => {
    setTreeLoading(true)
    fetch('/api/terminal/tree', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: full, branch: br }),
    })
      .then((r) => r.json())
      .then((d) => setTree(Array.isArray(d.paths) ? d.paths : []))
      .catch(() => setTree([]))
      .finally(() => setTreeLoading(false))
  }, [])

  // Load repos on mount (async callback — not a synchronous effect setState).
  useEffect(() => {
    fetch('/api/terminal/repos')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.repos ?? []) as RepoOption[]
        setRepos(list)
        if (d.error) setReposError(d.error)
        if (list.length) {
          setRepo(list[0].full_name)
          loadTree(list[0].full_name, list[0].default_branch)
        }
      })
      .catch(() => setReposError('Could not load repos'))
  }, [loadTree])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (repoMenuRef.current && !repoMenuRef.current.contains(e.target as Node)) setRepoMenu(false)
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, running])

  const selectRepo = useCallback((r: RepoOption) => {
    setRepo(r.full_name)
    setRepoMenu(false)
    setSessionId(null)
    setBranch(null)
    setPending(false)
    setMessages([])
    setTree([])
    loadTree(r.full_name, r.default_branch)
    inputRef.current?.focus()
  }, [loadTree])

  const exec = useCallback(
    async (command: string, opts?: { silentUser?: boolean }) => {
      if (!repo) { push({ id: uid(), role: 'system', text: 'Select a repo to start.' }); return }
      if (!opts?.silentUser) push({ id: uid(), role: 'user', text: command })
      setRunning(true)
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch('/api/terminal/exec', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo, command, session_id: sessionId, model, effort }),
          signal: controller.signal,
        })
        const data = await res.json()
        if (data.session_id) setSessionId(data.session_id)
        setBranch(data.current_branch ?? null)
        setPending(!!data.has_pending_diff)
        const text = (data.output ?? data.error ?? '').toString()

        if (data.action === 'propose_edit' && data.exit_code === 0) {
          // File name comes from the server (the pending diff's path), not
          // parsed from the diff text — the diff's first line is "Index:".
          const file = data.pending_file ?? 'file'
          push({ id: uid(), role: 'agent', kind: 'proposal', file, diff: text, reasoning: data.reasoning ?? '', isNewFile: text.includes('new file'), state: 'pending' })
        } else if (data.action === 'apply' && data.exit_code === 0) {
          setMessages((prev) => prev.map((m) => (m.role === 'agent' && m.kind === 'proposal' && m.state === 'pending' ? { ...m, state: 'applied' } : m)))
          push({ id: uid(), role: 'agent', kind: 'text', text: text || 'Applied to the working copy.' })
        } else if (data.action === 'discard' && data.exit_code === 0) {
          setMessages((prev) => prev.map((m) => (m.role === 'agent' && m.kind === 'proposal' && m.state === 'pending' ? { ...m, state: 'discarded' } : m)))
        } else if (data.action === 'commit' && data.exit_code === 0) {
          push({ id: uid(), role: 'agent', kind: 'commit', text })
        } else if (data.action === 'pr' && data.exit_code === 0) {
          push({ id: uid(), role: 'agent', kind: 'pr', text })
        } else if (data.exit_code !== 0) {
          push({ id: uid(), role: 'agent', kind: 'error', text: text || 'Command failed.' })
        } else {
          push({ id: uid(), role: 'agent', kind: 'output', text: text || '(no output)' })
        }
      } catch (e) {
        push({ id: uid(), role: 'agent', kind: e instanceof Error && e.name === 'AbortError' ? 'text' : 'error', text: e instanceof Error && e.name === 'AbortError' ? 'Cancelled.' : 'Network error — try again.' })
      } finally {
        setRunning(false)
        abortRef.current = null
        inputRef.current?.focus()
      }
    },
    [repo, sessionId, model, effort, push],
  )

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    exec(text)
  }, [input, running, exec])

  const currentModel = MODELS.find((m) => m.id === model)

  return (
    <div className="flex h-screen w-full flex-col bg-surface-base text-foreground">
      {/* ── Top bar: model + effort ─────────────────────────────── */}
      <header className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-border bg-surface-secondary px-3">
        <Link href="/resources" className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/15">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">enry</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">coding agent</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Effort segmented control */}
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface-base p-0.5">
            <Gauge className="ml-1 h-3 w-3 text-muted-foreground" />
            {EFFORTS.map((e) => (
              <button
                key={e.id}
                onClick={() => setEffort(e.id)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  effort === e.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>

          {/* Model picker */}
          <div ref={modelMenuRef} className="relative">
            <button
              onClick={() => setModelMenu((o) => !o)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface-base px-2.5 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:border-primary/40"
            >
              <Cpu className="h-3 w-3 text-primary" />
              {currentModel?.label}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {modelMenu && (
              <div className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-md border border-border bg-surface-elevated shadow-2xl">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setModelMenu(false) }}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-secondary ${m.id === model ? 'bg-primary/5' : ''}`}
                  >
                    <span className={`font-mono text-[11px] ${m.id === model ? 'text-primary' : 'text-foreground'}`}>{m.label}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">{m.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Left rail: repo / branch / tree ───────────────────── */}
        <aside className="flex w-64 flex-shrink-0 flex-col border-r border-border bg-surface-secondary/50">
          <div ref={repoMenuRef} className="relative border-b border-border p-2">
            <button
              onClick={() => setRepoMenu((o) => !o)}
              className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-base px-2.5 py-2 text-left transition-colors hover:border-primary/40"
            >
              <Folder className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{repo || 'select a repo'}</span>
              <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            </button>
            {repoMenu && (
              <div className="absolute left-2 right-2 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-surface-elevated shadow-2xl">
                {repos.length === 0 ? (
                  <div className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{reposError ?? 'no repos'}</div>
                ) : repos.map((r) => (
                  <button
                    key={r.full_name}
                    onClick={() => selectRepo(r)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-surface-secondary ${r.full_name === repo ? 'text-primary' : 'text-foreground'}`}
                  >
                    <span className="truncate">{r.full_name}</span>
                    {r.private && <span className="ml-2 text-[8px] uppercase text-muted-foreground">private</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* branch */}
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <GitBranch className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground">
              {branch ? <span className="text-primary">{branch}</span> : 'default branch'}
            </span>
            {pending && <span className="ml-auto rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-warning">pending</span>}
          </div>

          {/* tree */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <FileTree paths={tree} loading={treeLoading} onPick={(p) => { setInput((v) => v ? v : `edit ${p} `); inputRef.current?.focus() }} />
          </div>

          <Link
            href="/resources/terminal"
            className="flex items-center gap-1.5 border-t border-border px-3 py-2 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <TerminalIcon className="h-3 w-3" />
            raw terminal
            <ChevronRight className="ml-auto h-3 w-3" />
          </Link>
        </aside>

        {/* ── Center: conversation + input ──────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col bg-surface-base">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl px-6 py-8">
              {messages.length === 0 ? (
                <EmptyState repo={repo} onExample={(ex) => setInput(ex)} />
              ) : (
                <div className="space-y-5">
                  {messages.map((m) => (
                    <MessageView key={m.id} m={m} running={running} onAction={exec} />
                  ))}
                </div>
              )}
              {running && (
                <div className="mt-5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  working…
                </div>
              )}
            </div>
          </div>

          <CommandInput
            ref={inputRef}
            value={input}
            onChange={setInput}
            onSend={send}
            running={running}
            disabled={!repo}
          />
        </main>
      </div>
    </div>
  )
}

// ── Message rendering ─────────────────────────────────────────────────────────
function MessageView({ m, running, onAction }: { m: Message; running: boolean; onAction: (cmd: string) => void }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-border bg-surface-elevated px-4 py-2.5 text-sm leading-relaxed text-foreground">
          {m.text}
        </div>
      </div>
    )
  }
  if (m.role === 'system') {
    return <div className="text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{m.text}</div>
  }
  if (m.kind === 'text') {
    return <div className="text-sm leading-relaxed text-foreground/90">{m.text}</div>
  }
  if (m.kind === 'output') {
    return (
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface-secondary/60 p-3 font-mono text-[12px] leading-relaxed text-foreground/80">
        {m.text}
      </pre>
    )
  }
  if (m.kind === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" />
        <span className="font-mono text-[12px] leading-relaxed text-red-400">{m.text}</span>
      </div>
    )
  }
  if (m.kind === 'commit') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
        <GitCommit className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <span className="whitespace-pre-wrap font-mono text-[12px] text-foreground/90">{m.text}</span>
      </div>
    )
  }
  if (m.kind === 'pr') {
    const url = m.text.match(/https?:\/\/\S+/)?.[0]
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
        <GitPullRequest className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <span className="font-mono text-[12px] text-foreground/90">{m.text.split('\n')[0]}</span>
        {url && <a href={url} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[11px] text-primary hover:underline">open →</a>}
      </div>
    )
  }
  // proposal
  return <ProposalCard m={m} running={running} onAction={onAction} />
}

function ProposalCard({ m, running, onAction }: { m: Extract<Message, { kind: 'proposal' }>; running: boolean; onAction: (cmd: string) => void }) {
  const [showThinking, setShowThinking] = useState(true)
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      {/* Thinking / telemetry — dimmed mono, a code-comment rail */}
      {m.reasoning && (
        <div>
          <button
            onClick={() => setShowThinking((s) => !s)}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${showThinking ? 'rotate-90' : ''}`} />
            thinking
          </button>
          <AnimatePresence initial={false}>
            {showThinking && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="mt-1.5 border-l-2 border-border pl-3 font-mono text-[11px] leading-relaxed text-muted-foreground/90 whitespace-pre-wrap">
                  {m.reasoning}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* The diff */}
      <div className={`overflow-hidden rounded-lg border ${m.state === 'pending' ? 'border-warning/40' : m.state === 'applied' ? 'border-primary/40' : 'border-border'} bg-[#0a0a0a]`}>
        <div className="flex items-center justify-between border-b border-border/60 bg-surface-secondary px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <FileCode className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-[11px] text-foreground">{m.file}</span>
            {m.isNewFile && <span className="rounded border border-border px-1 py-0.5 font-mono text-[8px] uppercase text-muted-foreground">new</span>}
          </div>
          {m.state === 'pending' ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onAction('apply')}
                disabled={running}
                className="flex items-center gap-1 rounded border border-primary/50 bg-primary/15 px-2 py-0.5 font-mono text-[10px] text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
              >
                <Check className="h-3 w-3" /> Apply
              </button>
              <button
                onClick={() => onAction('discard')}
                disabled={running}
                className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                title="Discard this proposal"
              >
                <X className="h-3 w-3" /> Discard
              </button>
            </div>
          ) : (
            <span className={`flex items-center gap-1 font-mono text-[10px] ${m.state === 'applied' ? 'text-primary' : 'text-muted-foreground'}`}>
              {m.state === 'applied' ? <><Check className="h-3 w-3" /> applied</> : 'discarded'}
            </span>
          )}
        </div>
        <div className="max-h-80 overflow-auto p-2">
          <DiffView diffText={m.diff} />
        </div>
      </div>

      {m.state === 'applied' && (
        <div className="flex items-center gap-1.5 pl-1">
          <button onClick={() => onAction('commit "apply agent changes"')} disabled={running}
            className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50">
            <GitCommit className="h-3 w-3" /> Commit
          </button>
          <button onClick={() => onAction('pr "Agent changes" "Proposed by enry coding agent"')} disabled={running}
            className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50">
            <GitPullRequest className="h-3 w-3" /> Open PR
          </button>
        </div>
      )}
    </motion.div>
  )
}

// ── File tree ─────────────────────────────────────────────────────────────────
function FileTree({ paths, loading, onPick }: { paths: string[]; loading: boolean; onPick: (p: string) => void }) {
  if (loading) return <div className="flex items-center gap-1.5 px-1 font-mono text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> loading tree…</div>
  if (paths.length === 0) return <div className="px-1 font-mono text-[10px] text-muted-foreground/60">no files</div>
  // Flat, indented-by-depth listing — light-weight orientation, not a full explorer.
  return (
    <div className="space-y-0.5">
      {paths.slice(0, 400).map((p) => {
        const depth = p.split('/').length - 1
        const name = p.split('/').pop() ?? p
        return (
          <button
            key={p}
            onClick={() => onPick(p)}
            title={p}
            className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground"
            style={{ paddingLeft: `${4 + depth * 10}px` }}
          >
            <FileCode className="h-3 w-3 flex-shrink-0 opacity-50" />
            <span className="truncate">{name}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ repo, onExample }: { repo: string; onExample: (ex: string) => void }) {
  const examples = ['Fix the typo in the README', 'Add a .env.example with the keys this app reads', 'Add a section to the README explaining setup']
  return (
    <div className="flex flex-col items-center pt-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <h1 className="font-mono text-lg font-semibold tracking-tight text-foreground">Describe a change</h1>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {repo ? <>Working in <span className="font-mono text-foreground">{repo}</span>. Ask for a change in plain language — the agent plans, shows a diff, and waits for you to apply. Nothing is written until you say so.</> : 'Select a repo in the left rail to start.'}
      </p>
      {repo && (
        <div className="mt-6 flex flex-col gap-2">
          {examples.map((ex) => (
            <button key={ex} onClick={() => onExample(ex)}
              className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Command input with slash palette ──────────────────────────────────────────
const CommandInput = ({ ref, value, onChange, onSend, running, disabled }: {
  ref: React.RefObject<HTMLTextAreaElement | null>
  value: string; onChange: (v: string) => void; onSend: () => void; running: boolean; disabled: boolean
}) => {
  const [paletteIdx, setPaletteIdx] = useState(0)
  const showPalette = value.startsWith('/') && !value.includes(' ')
  const matches = showPalette
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(value.slice(1).toLowerCase()))
    : []

  const pick = (template: string) => {
    onChange(template)
    ref.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPalette && matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIdx((i) => Math.min(i + 1, matches.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIdx((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && matches[paletteIdx])) { e.preventDefault(); pick(matches[paletteIdx].template); setPaletteIdx(0); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
  }

  return (
    <div className="relative flex-shrink-0 border-t border-border bg-surface-secondary px-6 py-3">
      <div className="mx-auto max-w-3xl">
        {showPalette && matches.length > 0 && (
          <div className="absolute bottom-full left-6 right-6 mb-2 mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-2xl">
            {matches.map((c, i) => (
              <button
                key={c.cmd}
                onMouseEnter={() => setPaletteIdx(i)}
                onClick={() => pick(c.template)}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors ${i === paletteIdx ? 'bg-surface-secondary' : ''}`}
              >
                <span className="font-mono text-[11px] text-primary">/{c.cmd}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{c.hint}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface-base px-3 py-2 focus-within:border-primary/40">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={disabled}
            spellCheck={false}
            placeholder={disabled ? 'Select a repo first…' : 'Describe a change, or type / for commands…'}
            className="max-h-40 flex-1 resize-none bg-transparent py-1 text-sm text-foreground placeholder-muted-foreground/50 outline-none disabled:opacity-50"
          />
          <button
            onClick={onSend}
            disabled={disabled || running || !value.trim()}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-surface-base transition-opacity hover:opacity-90 disabled:bg-surface-elevated disabled:text-muted-foreground"
          >
            <CornerDownLeft className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center font-mono text-[9px] text-muted-foreground/60">
          natural language is default · <span className="text-muted-foreground">/</span> for explicit commands · Enter to send
        </p>
      </div>
    </div>
  )
}
