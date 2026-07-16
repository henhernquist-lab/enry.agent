'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, Loader2, TerminalSquare, GitBranch,
  Send, Check, X, Copy, ArrowRight, Zap, Sliders,
} from 'lucide-react'
import { DiffView } from './diff-view'

// ─── Types ──────────────────────────────────────────────────

interface RepoOption {
  full_name: string
  default_branch: string
  private: boolean
}

type ChatLine =
  | { kind: 'prompt'; text: string }
  | { kind: 'system'; text: string }
  | { kind: 'proposal'; file: string; diff: string; isNewFile: boolean }
  | { kind: 'applied'; text: string }
  | { kind: 'committed'; text: string }
  | { kind: 'pr'; text: string }
  | { kind: 'error'; text: string }

// ─── Model definitions ──────────────────────────────────────

// Qwen is first (and default — see MODELS[0] below) because deepseek-ai's NIM
// function is currently in a live DEGRADED/hanging state on NVIDIA's side
// (confirmed directly against their API — deepseek-v4-flash returns an
// explicit "DEGRADED function cannot be invoked", deepseek-v4-pro hangs to a
// full timeout with zero response). Not a code bug — nothing here can fix an
// upstream outage. Move DeepSeek back to the front once NVIDIA resolves it.
const MODELS = [
  { id: 'qwen/qwen3.5-122b-a10b',      label: 'Qwen 3.5 122B',    desc: 'Large reasoning model. Great for analysis.' },
  { id: 'z-ai/glm-5.2',                label: 'GLM 5.2',          desc: 'Versatile all-rounder. Good at following instructions.' },
  { id: 'minimax/minimax-m3',          label: 'MiniMax M3',        desc: 'Fast and capable. Great for general tasks.' },
  { id: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro',  desc: '⚠ currently degraded on NVIDIA’s side — likely to time out.' },
] as const

const EFFORTS = [
  { id: 'none',    label: 'Auto',     desc: 'Default reasoning' },
  { id: 'low',     label: 'Quick',    desc: 'Minimal reasoning, fast' },
  { id: 'medium',  label: 'Balanced', desc: 'Moderate reasoning depth' },
  { id: 'high',    label: 'Deep',     desc: 'Maximum reasoning, slower' },
] as const

// ─── Component ──────────────────────────────────────────────

export function TerminalChat({ autoFocus = true }: { autoFocus?: boolean }) {
  const [repos, setRepos] = useState<RepoOption[]>([])
  const [repo, setRepo] = useState<string>('')
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [model, setModel] = useState<string>(MODELS[0].id)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [effort, setEffort] = useState<(typeof EFFORTS)[number]['id']>('none')
  const [effortMenuOpen, setEffortMenuOpen] = useState(false)
  const [lines, setLines] = useState<ChatLine[]>([
    { kind: 'system', text: 'enry coding agent — select a repo and describe what you want changed. Changes are proposed first — nothing writes until you approve.' },
  ])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [hasPendingDiff, setHasPendingDiff] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const repoMenuRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const effortMenuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (repoMenuRef.current && !repoMenuRef.current.contains(e.target as Node)) setRepoMenuOpen(false)
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelMenuOpen(false)
      if (effortMenuRef.current && !effortMenuRef.current.contains(e.target as Node)) setEffortMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  const selectRepo = useCallback((full: string) => {
    setRepo(full)
    setSessionId(null)
    setCurrentBranch(null)
    setHasPendingDiff(false)
    setRepoMenuOpen(false)
    inputRef.current?.focus()
  }, [])

  // One request/response leg to /api/terminal/exec. On 'target_resolved' —
  // the server classified the NL request's target file but deliberately
  // stopped short of generating the diff, so that step gets its own fresh
  // maxDuration budget instead of sharing one with this classification call
  // (see exec/route.ts) — this immediately fires the follow-up request with
  // the resolved target, invisibly to the user (no extra prompt line; from
  // their side it's still "typed one thing, got one result"). depth guards
  // against ever chaining more than once.
  // A function declaration (not useCallback) so its recursive self-call below
  // is safe — a `const` bound via useCallback can't reference itself inside
  // its own initializer without a TDZ hazard.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  async function runHop(body: Record<string, unknown>, originalCommand: string, signal: AbortSignal, depth: number): Promise<void> {
    const res = await fetch('/api/terminal/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    // A non-2xx with no JSON body (an unhandled server exception, a platform-
    // level error page) still deserves a real status code in the message
    // instead of falling through to a parse failure that reads as generic.
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      let parsed: { error?: string } | null = null
      try { parsed = JSON.parse(detail) } catch { /* not JSON */ }
      setLines((l) => [...l, { kind: 'error', text: parsed?.error || `Request failed (HTTP ${res.status})` }])
      return
    }
    const data = await res.json()
    if (data.session_id) setSessionId(data.session_id)
    setCurrentBranch(data.current_branch ?? null)
    setHasPendingDiff(!!data.has_pending_diff)

    if (data.action === 'target_resolved' && depth < 1) {
      await runHop(
        {
          ...body, session_id: data.session_id,
          command: originalCommand, proceed: true,
          target_file: data.target_file, is_new_file: data.is_new_file, instruction: originalCommand,
        },
        originalCommand, signal, depth + 1,
      )
      return
    }

    const text = (data.output ?? data.error ?? '').toString()
    const action = data.action

    if (action === 'propose_edit' && data.exit_code === 0) {
      // Parse diff info from the output
      const fileMatch = text.match(/^([^:]+):/m)
      const file = fileMatch ? fileMatch[1].trim() : 'unknown'
      setLines((l) => [...l, { kind: 'proposal', file, diff: text, isNewFile: text.includes('new file') }])
    } else if (action === 'apply' && data.exit_code === 0) {
      setLines((l) => [...l, { kind: 'applied', text: text || '✓ Changes applied to working copy' }])
    } else if (action === 'commit' && data.exit_code === 0) {
      setLines((l) => [...l, { kind: 'committed', text: text }])
    } else if (action === 'pr' && data.exit_code === 0) {
      setLines((l) => [...l, { kind: 'pr', text: text }])
    } else if (data.exit_code !== 0) {
      setLines((l) => [...l, { kind: 'error', text: text || 'command failed' }])
    } else {
      setLines((l) => [...l, { kind: 'system', text: text || '(done)' }])
    }
  }

  const exec = useCallback(
    async (command: string) => {
      if (!repo) {
        setLines((l) => [...l, { kind: 'system', text: '⚠ select a repo first' }])
        return
      }
      setRunning(true)
      const controller = new AbortController()
      abortRef.current = controller
      try {
        await runHop({ repo, command, session_id: sessionId, model, effort }, command, controller.signal, 0)
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          setLines((l) => [...l, { kind: 'system', text: 'Cancelled' }])
        } else {
          // A raw fetch() rejection here carries no server-provided reason —
          // that's what makes it a network-level failure rather than an HTTP
          // error response (those are handled above, with the real status/
          // body). Log the actual error so it's inspectable in the console
          // instead of vanishing into a message that claims more than we know.
          console.error('[terminal] request failed:', e)
          setLines((l) => [...l, { kind: 'error', text: 'Request failed or timed out — retry' }])
        }
      } finally {
        setRunning(false)
        abortRef.current = null
      }
    },
    // runHop is a plain function (recreated every render, deliberately — see
    // its own comment), so it can never be a stable dependency; including it
    // just means exec is recreated every render too, which costs nothing here.
    [repo, sessionId, model, effort, runHop],
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

  const currentModel = MODELS.find((m) => m.id === model)
  const currentEffort = EFFORTS.find((e) => e.id === effort)

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-[#0a0a0a] font-mono text-[13px]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-secondary px-3 py-2">
        <TerminalSquare className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">coding agent</span>

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

        <div className="ml-auto flex items-center gap-1.5">
          {/* Effort toggle */}
          <div ref={effortMenuRef} className="relative">
            <button
              onClick={() => setEffortMenuOpen((o) => !o)}
              className="flex items-center gap-1 rounded border border-border bg-surface-base px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary/40"
              title={`Reasoning: ${currentEffort?.desc}`}
            >
              <Zap className="h-2.5 w-2.5" />
              {currentEffort?.label}
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
            {effortMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded border border-border bg-surface-elevated shadow-xl">
                {EFFORTS.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => { setEffort(e.id); setEffortMenuOpen(false) }}
                    className={`flex w-full flex-col px-3 py-1.5 text-left text-[10px] transition-colors hover:bg-surface-secondary ${
                      effort === e.id ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    <span className="font-semibold">{e.label}</span>
                    <span className="text-[9px] text-muted-foreground">{e.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Model picker */}
          <div ref={modelMenuRef} className="relative">
            <button
              onClick={() => setModelMenuOpen((o) => !o)}
              className="flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] text-primary transition-colors hover:bg-primary/20"
            >
              <Sliders className="h-2.5 w-2.5" />
              {currentModel?.label}
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
            {modelMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded border border-border bg-surface-elevated shadow-xl">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setModelMenuOpen(false) }}
                    className={`flex w-full flex-col px-3 py-1.5 text-left text-[10px] transition-colors hover:bg-surface-secondary ${
                      model === m.id ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    <span className="font-semibold">{m.label}</span>
                    <span className="text-[9px] text-muted-foreground">{m.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Repo selector */}
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
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 leading-relaxed scrollbar-hidden"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((line, i) => {
          if (line.kind === 'prompt') {
            return (
              <div key={i} className="mb-3">
                <div className="inline-flex max-w-[85%] items-start gap-2 rounded-lg rounded-br-sm border border-primary/30 bg-primary/5 px-3 py-2">
                  <span className="whitespace-pre-wrap text-sm text-foreground">{line.text}</span>
                </div>
              </div>
            )
          }

          if (line.kind === 'system') {
            return (
              <div key={i} className="mb-2 whitespace-pre-wrap break-words text-muted-foreground text-xs">
                {line.text}
              </div>
            )
          }

          if (line.kind === 'error') {
            return (
              <div key={i} className="mb-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {line.text}
              </div>
            )
          }

          if (line.kind === 'proposal') {
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-3 rounded-lg border border-warning/30 bg-surface-secondary p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-warning">
                    Proposed change{line.isNewFile ? ' (new file)' : ''}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleQuickAction('apply')}
                      disabled={running}
                      className="flex items-center gap-1 rounded border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                      Apply
                    </button>
                    <button
                      onClick={() => setLines((l) => l.filter((_, j) => j !== i))}
                      className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto rounded border border-border/50 bg-[#0a0a0a] p-2">
                  <DiffView diffText={line.diff} />
                </div>
              </motion.div>
            )
          }

          if (line.kind === 'applied') {
            return (
              <div key={i} className="mb-2">
                <div className="inline-flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <div>
                    <span className="whitespace-pre-wrap text-xs text-foreground">{line.text}</span>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        onClick={() => handleQuickAction('commit "apply proposed changes"')}
                        disabled={running}
                        className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                      >
                        Commit
                      </button>
                      <button
                        onClick={() => handleQuickAction('pr "Proposed changes" "Auto-generated by enry coding agent"')}
                        disabled={running}
                        className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                      >
                        Create PR
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          if (line.kind === 'committed') {
            return (
              <div key={i} className="mb-2 rounded border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
                <span className="text-primary">✓ Committed — </span>
                {line.text}
              </div>
            )
          }

          if (line.kind === 'pr') {
            return (
              <div key={i} className="mb-2 rounded border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
                <span className="text-primary">✓ PR created — </span>
                {line.text}
              </div>
            )
          }

          return null
        })}

        {running && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking…
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-surface-secondary p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            autoFocus={autoFocus}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want changed — e.g. 'fix the typo in the README' or 'add a .env.example'…"
            rows={2}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            disabled={running}
            className="flex-1 resize-none rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || running}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-primary bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:border-border disabled:bg-surface-elevated disabled:text-muted-foreground"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <p className="text-[10px] text-muted-foreground">
            <kbd className="rounded border border-border bg-surface-elevated px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send ·{' '}
            <kbd className="rounded border border-border bg-surface-elevated px-1 py-0.5 font-mono text-[9px]">Shift+Enter</kbd> for new line
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => handleQuickAction('branch feature/coding-agent')}
              disabled={running}
              className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
            >
              <GitBranch className="inline h-2.5 w-2.5 mr-0.5" />
              Branch
            </button>
            <LinkToTerminal />
          </div>
        </div>
      </div>
    </div>
  )
}

function LinkToTerminal() {
  return (
    <a
      href="/resources/terminal"
      className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
    >
      <TerminalSquare className="h-2.5 w-2.5" />
      Raw terminal
      <ArrowRight className="h-2.5 w-2.5" />
    </a>
  )
}
