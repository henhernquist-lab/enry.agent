'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft, Brain, Loader2, Send, Sparkles } from 'lucide-react'
import { LEARN_SKILLS } from '@/lib/skills/registry'

// Enry Learn — base scaffolding. Mirrors app/agent/page.tsx's structure
// (client page, one exec endpoint, a scrollback of typed verbs) sized down
// to what the base actually supports: `learn`/`probe` are real, the rest are
// stubs that round-trip to the server and echo back "not yet implemented" —
// same as clicking them will keep doing until a feature agent replaces the
// stub in learn-ops.ts's dispatcher.

type Line =
  | { kind: 'prompt'; text: string }
  | { kind: 'output'; text: string }
  | { kind: 'probe'; text: string; claimId: string }
  | { kind: 'error'; text: string }
  | { kind: 'system'; text: string }

const STUB_VERBS = ['gap', 'defend', 'teach', 'retire'] as const

export default function LearnPage() {
  const { status } = useSession()
  const router = useRouter()

  const [lines, setLines] = useState<Line[]>([
    { kind: 'system', text: 'enry learn — every belief starts as a claim. learn "<topic>" to begin, or probe to check in on what\'s due.' },
  ])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pendingProbe, setPendingProbe] = useState<{ claim_id: string; content: string; topic: string } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  const exec = useCallback(async (verb: string, verbInput: string, promptText?: string) => {
    setRunning(true)
    if (promptText) setLines((l) => [...l, { kind: 'prompt', text: promptText }])
    try {
      const res = await fetch('/api/learn/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verb, input: verbInput, session_id: sessionId }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        let parsed: { error?: string } | null = null
        try { parsed = JSON.parse(detail) } catch { /* not JSON */ }
        setLines((l) => [...l, { kind: 'error', text: parsed?.error || `Request failed (HTTP ${res.status})` }])
        return
      }
      const data = await res.json()
      if (data.session_id) setSessionId(data.session_id)
      setPendingProbe(data.pending_probe ?? null)

      const text = (data.output ?? data.error ?? '').toString()
      if (data.exit_code !== 0) {
        setLines((l) => [...l, { kind: 'error', text }])
      } else if (verb === 'probe' && data.data?.claim_id && !data.pending_probe_answered) {
        setLines((l) => [...l, { kind: 'probe', text, claimId: data.data.claim_id }])
      } else {
        setLines((l) => [...l, { kind: 'output', text }])
      }
    } catch {
      setLines((l) => [...l, { kind: 'error', text: 'network error — retry' }])
    } finally {
      setRunning(false)
    }
  }, [sessionId])

  const handleSend = () => {
    const text = input.trim()
    if (!text || running) return
    setInput('')

    // If we're mid-probe, whatever the user typed is the answer — route it
    // straight back into probe rather than making them type "probe" first.
    if (pendingProbe) {
      exec('probe', text, text)
      return
    }

    // learn "<topic>" / learn <topic> — otherwise treat the whole line as a
    // learn input directly (typing a bare topic should just work).
    const learnMatch = text.match(/^learn\s+"?([\s\S]+?)"?$/i)
    if (learnMatch) {
      exec('learn', learnMatch[1], text)
      return
    }
    if (/^probe$/i.test(text)) {
      exec('probe', '', text)
      return
    }
    const stubMatch = STUB_VERBS.find((v) => new RegExp(`^${v}\\b`, 'i').test(text))
    if (stubMatch) {
      exec(stubMatch, text.replace(new RegExp(`^${stubMatch}\\s*`, 'i'), ''), text)
      return
    }
    exec('learn', text, text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isLoading = status === 'loading'
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background font-sans">
      <header className="flex h-10 flex-shrink-0 items-center gap-3 border-b border-border bg-background px-4">
        <Link href="/" className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Home
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">Learn</span>
        {pendingProbe && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-warning">Awaiting answer</span>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Conversation */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hidden">
            <div className="mx-auto max-w-[720px] px-8 py-6">
              {lines.map((line, i) => {
                if (line.kind === 'system') {
                  return <div key={i} className="mb-3"><p className="font-mono text-[11px] leading-relaxed text-muted-foreground/60">{line.text}</p></div>
                }
                if (line.kind === 'prompt') {
                  return (
                    <div key={i} className="mb-6">
                      <div className="border-l-2 border-primary/40 pl-4">
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">You</div>
                        <p className="font-sans text-[14px] leading-relaxed text-foreground">{line.text}</p>
                      </div>
                    </div>
                  )
                }
                if (line.kind === 'probe') {
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="mb-5">
                      <div className="border-l-2 border-accent/50 pl-4">
                        <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-accent/70">
                          <Brain className="h-3 w-3" /> Probe
                        </div>
                        <p className="font-sans text-[14px] leading-relaxed text-foreground">{line.text}</p>
                      </div>
                    </motion.div>
                  )
                }
                if (line.kind === 'error') {
                  return (
                    <div key={i} className="mb-4">
                      <div className="border-l-2 border-destructive/40 pl-4">
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-destructive/60">Error</div>
                        <p className="font-mono text-[12px] leading-relaxed text-destructive">{line.text}</p>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={i} className="mb-4">
                    <div className="border-l-2 border-primary/20 pl-4">
                      <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-foreground/80">{line.text}</p>
                    </div>
                  </div>
                )
              })}
              <AnimatePresence>
                {running && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-4 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
                    <span className="font-mono text-[11px] text-muted-foreground/40">thinking</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-border bg-background px-4 py-3">
            <div className="mx-auto max-w-[820px] space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => exec('probe', '', 'probe')} disabled={running}
                  className="flex items-center gap-1 rounded border border-border bg-surface-secondary px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-40">
                  <Brain className="h-3 w-3" /> Probe
                </button>
                {STUB_VERBS.map((v) => (
                  <button key={v} onClick={() => exec(v, '', v)} disabled={running}
                    className="flex items-center gap-1 rounded border border-border bg-surface-secondary px-2.5 py-1.5 font-mono text-[10px] capitalize text-muted-foreground/60 transition-colors hover:border-border hover:text-muted-foreground disabled:opacity-40">
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={pendingProbe ? 'Type your answer…' : 'learn "<topic>" — or paste a source'}
                  rows={1} spellCheck={false} disabled={running}
                  className="flex-1 resize-none rounded border border-border bg-surface-secondary px-3 py-2 font-mono text-[13px] leading-relaxed text-foreground placeholder-muted-foreground/40 focus:border-primary/30 focus:outline-none disabled:opacity-40 min-h-[80px]"
                  style={{ maxHeight: '200px' }} />
                <button onClick={handleSend} disabled={!input.trim() || running}
                  className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-30 ${
                    input.trim() && !running
                      ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                      : 'border-border bg-surface-secondary text-muted-foreground hover:border-primary/30 hover:text-primary'
                  }`}>
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Techniques sidebar — the four learning skills moved out of main
            chat. Not wired to anything yet: teach/defend are stubs, so these
            are browsable, not actionable, until a feature agent builds the
            verb that uses them. */}
        <aside className="hidden w-[240px] flex-shrink-0 flex-col border-l border-border bg-[#0a0b0d] lg:flex">
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Techniques</span>
            </div>
            <p className="mt-1 font-mono text-[9px] leading-relaxed text-muted-foreground/50">
              Moved here from main chat. Wired into teach/defend once those verbs are built.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {LEARN_SKILLS.map((s) => (
              <div key={s.slug} className="border-b border-border/40 px-3 py-2.5">
                <div className="font-mono text-[11px] font-semibold text-foreground">{s.name}</div>
                <div className="mt-0.5 font-sans text-[10px] leading-relaxed text-muted-foreground">{s.description}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
