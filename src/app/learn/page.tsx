'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft,
  Archive,
  Brain,
  BookOpen,
  GitCompare,
  GraduationCap,
  Layers,
  Library,
  Loader2,
  Map as MapIcon,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { LEARN_SKILLS } from '@/lib/skills/registry'

// Enry Learn — base scaffolding. Mirrors app/agent/page.tsx's structure
// (client page, one exec endpoint, a scrollback of typed verbs) sized down
// to what the base actually supports: `learn`/`probe` are real, the rest are
// stubs that round-trip to the server and echo back "not yet implemented" —
// same as clicking them will keep doing until a feature agent replaces the
// stub in learn-ops.ts's dispatcher.

type Line =
  | { kind: 'prompt'; text: string }
  | { kind: 'output'; text: string; verb: string }
  | { kind: 'probe'; text: string; claimId: string }
  | { kind: 'error'; text: string }
  | { kind: 'system'; text: string }

const STUB_VERBS = ['gap', 'defend', 'teach', 'retire'] as const

type TabKey = 'chat' | 'map' | 'diff' | 'sources'

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'map', label: 'Map', icon: MapIcon },
  { key: 'diff', label: 'Diff', icon: GitCompare },
  { key: 'sources', label: 'Sources', icon: Library },
]

// Every verb gets its own accent so a message's left border tells you what
// produced it at a glance — the button that triggered it and the line it
// wrote share a color. `cyan` pulls from the chart-2 token (the one new
// accent beyond what the rest of the app already uses); everything else is
// existing theme tokens.
type ColorKey = 'primary' | 'accent' | 'warning' | 'destructive' | 'cyan' | 'muted'

const COLOR: Record<ColorKey, {
  border: string
  borderLeft: string
  activeBorder: string
  text: string
  hoverText: string
  bg: string
  activeBg: string
  glow: string
}> = {
  primary: {
    border: 'border-primary/50',
    borderLeft: 'border-l-primary/50',
    activeBorder: 'border-primary',
    text: 'text-primary',
    hoverText: 'hover:text-primary',
    bg: 'bg-primary/5',
    activeBg: 'bg-primary/20',
    glow: 'shadow-[0_0_12px_-2px_rgba(58,158,96,0.55)]',
  },
  accent: {
    border: 'border-accent/50',
    borderLeft: 'border-l-accent/50',
    activeBorder: 'border-accent',
    text: 'text-accent',
    hoverText: 'hover:text-accent',
    bg: 'bg-accent/5',
    activeBg: 'bg-accent/20',
    glow: 'shadow-[0_0_12px_-2px_rgba(59,130,196,0.55)]',
  },
  warning: {
    border: 'border-warning/50',
    borderLeft: 'border-l-warning/50',
    activeBorder: 'border-warning',
    text: 'text-warning',
    hoverText: 'hover:text-warning',
    bg: 'bg-warning/5',
    activeBg: 'bg-warning/20',
    glow: 'shadow-[0_0_12px_-2px_rgba(255,184,0,0.55)]',
  },
  destructive: {
    border: 'border-destructive/50',
    borderLeft: 'border-l-destructive/50',
    activeBorder: 'border-destructive',
    text: 'text-destructive',
    hoverText: 'hover:text-destructive',
    bg: 'bg-destructive/5',
    activeBg: 'bg-destructive/20',
    glow: 'shadow-[0_0_12px_-2px_rgba(255,77,77,0.55)]',
  },
  cyan: {
    border: 'border-chart-2/50',
    borderLeft: 'border-l-chart-2/50',
    activeBorder: 'border-chart-2',
    text: 'text-chart-2',
    hoverText: 'hover:text-chart-2',
    bg: 'bg-chart-2/5',
    activeBg: 'bg-chart-2/20',
    glow: 'shadow-[0_0_12px_-2px_rgba(0,200,255,0.55)]',
  },
  muted: {
    border: 'border-muted-foreground/30',
    borderLeft: 'border-l-muted-foreground/30',
    activeBorder: 'border-muted-foreground/60',
    text: 'text-muted-foreground',
    hoverText: 'hover:text-foreground',
    bg: 'bg-muted-foreground/5',
    activeBg: 'bg-muted-foreground/15',
    glow: 'shadow-[0_0_10px_-3px_rgba(156,163,175,0.35)]',
  },
}

const VERB_META: Record<string, { label: string; icon: LucideIcon; color: ColorKey }> = {
  learn: { label: 'Learn', icon: BookOpen, color: 'primary' },
  probe: { label: 'Probe', icon: Brain, color: 'accent' },
  gap: { label: 'Gap', icon: Search, color: 'warning' },
  defend: { label: 'Defend', icon: ShieldAlert, color: 'destructive' },
  teach: { label: 'Teach', icon: GraduationCap, color: 'cyan' },
  retire: { label: 'Retire', icon: Archive, color: 'muted' },
}

const VERB_BUTTONS: (typeof STUB_VERBS[number] | 'probe')[] = ['probe', 'gap', 'defend', 'teach', 'retire']

// Which future verb each moved technique will plug into (per LEARN.md: teach
// hosts Feynman-style explaining, defend hosts push-back/questioning). Both
// verbs are still stubs today, so clicking a card can't run the technique yet
// — it populates the input with a real, honest invocation of that stub verb
// instead of pretending to do something the base doesn't support.
const SKILL_META: Record<string, { color: ColorKey; verb: 'teach' | 'defend' }> = {
  feynman: { color: 'cyan', verb: 'teach' },
  'fifth-grader': { color: 'accent', verb: 'teach' },
  'socratic-mode': { color: 'warning', verb: 'defend' },
  'eli-expert': { color: 'primary', verb: 'defend' },
}

const COMING_SOON: Record<Exclude<TabKey, 'chat'>, { icon: LucideIcon; description: string }> = {
  map: { icon: MapIcon, description: 'A visual graph of your claims and how they connect to each other. Not built yet.' },
  diff: { icon: GitCompare, description: 'What changed in your understanding over time. Not built yet.' },
  sources: { icon: Library, description: 'Where your claims came from, gathered in one place. Not built yet.' },
}

function ComingSoonPanel({ tab }: { tab: Exclude<TabKey, 'chat'> }) {
  const { icon: Icon, description } = COMING_SOON[tab]
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
        <div className="rounded-full border border-border bg-surface-secondary p-4">
          <Icon className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/50">Coming soon</p>
        <p className="font-sans text-[12px] leading-relaxed text-muted-foreground/40">{description}</p>
      </div>
    </div>
  )
}

export default function LearnPage() {
  const { status } = useSession()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<TabKey>('chat')
  const [lines, setLines] = useState<Line[]>([
    { kind: 'system', text: 'enry learn — every belief starts as a claim. learn "<topic>" to begin, or probe to check in on what\'s due.' },
  ])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [activeVerb, setActiveVerb] = useState<string | null>(null)
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
    setActiveVerb(verb)
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
        setLines((l) => [...l, { kind: 'output', text, verb }])
      }
    } catch {
      setLines((l) => [...l, { kind: 'error', text: 'network error — retry' }])
    } finally {
      setRunning(false)
      setActiveVerb(null)
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

  // Clicking a technique card populates the input with a real invocation of
  // the stub verb it belongs to (teach/defend) and focuses the box, ready to
  // send — the honest version of "wire it up" given those verbs are stubs.
  const invokeTechnique = (slug: string) => {
    const meta = SKILL_META[slug] ?? { verb: 'teach' as const }
    const text = `${meta.verb} ${slug} `
    setInput(text)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(text.length, text.length)
      }
    })
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
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
          <GraduationCap className="h-3 w-3 text-primary/70" /> Learn
        </span>
        {pendingProbe && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-warning">Awaiting answer</span>
        )}
      </header>

      <div className="flex flex-shrink-0 items-center gap-1 border-b border-border bg-background px-3">
        {TABS.map((t) => {
          const active = activeTab === t.key
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground/50 hover:text-muted-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          )
        })}
      </div>

      {activeTab !== 'chat' ? (
        <ComingSoonPanel tab={activeTab} />
      ) : (
      <div className="flex min-h-0 flex-1">
        {/* Conversation */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hidden">
            <div className="mx-auto max-w-[720px] px-8 py-6">
              {lines.map((line, i) => {
                if (line.kind === 'system') {
                  return (
                    <div key={i} className="mb-3 border-l-2 border-muted-foreground/20 pl-3">
                      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground/60">{line.text}</p>
                    </div>
                  )
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
                  const color = COLOR[VERB_META.probe.color]
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="mb-5">
                      <div className={`border-l-2 ${color.border} ${color.bg} rounded-r py-2 pl-4 pr-3`}>
                        <div className={`mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${color.text}`}>
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
                const meta = VERB_META[line.verb] ?? VERB_META.learn
                const color = COLOR[meta.color]
                const Icon = meta.icon
                return (
                  <div key={i} className="mb-4">
                    <div className={`border-l-2 ${color.border} pl-4`}>
                      <div className={`mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${color.text}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </div>
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
                {VERB_BUTTONS.map((v) => {
                  const meta = VERB_META[v]
                  const color = COLOR[meta.color]
                  const Icon = meta.icon
                  const isActive = running && activeVerb === v
                  return (
                    <button
                      key={v}
                      onClick={() => exec(v, '', v)}
                      disabled={running}
                      className={`flex items-center gap-1 rounded border px-2.5 py-1.5 font-mono text-[10px] capitalize transition-all disabled:opacity-40 ${
                        isActive
                          ? `${color.activeBorder} ${color.activeBg} ${color.text} ${color.glow}`
                          : `border-border bg-surface-secondary text-muted-foreground/70 hover:border-border ${color.hoverText}`
                      }`}
                    >
                      <Icon className="h-3 w-3" /> {meta.label}
                    </button>
                  )
                })}
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
            chat. Each card is colored and clickable: it drops a real
            invocation of the stub verb (teach/defend) it belongs to into the
            input, ready to send. */}
        <aside className="hidden w-[240px] flex-shrink-0 flex-col border-l border-border bg-[#0a0b0d] lg:flex">
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Techniques</span>
            </div>
            <p className="mt-1 font-mono text-[9px] leading-relaxed text-muted-foreground/50">
              Click one to load its invocation into the input.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {LEARN_SKILLS.map((s) => {
              const meta = SKILL_META[s.slug] ?? { color: 'muted' as ColorKey, verb: 'teach' as const }
              const color = COLOR[meta.color]
              return (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => invokeTechnique(s.slug)}
                  className={`block w-full border-b border-b-border/40 border-l-2 ${color.borderLeft} px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated/40`}
                >
                  <div className={`font-mono text-[11px] font-semibold ${color.text}`}>{s.name}</div>
                  <div className="mt-0.5 font-sans text-[10px] leading-relaxed text-muted-foreground">{s.description}</div>
                </button>
              )
            })}
          </div>
        </aside>
      </div>
      )}
    </div>
  )
}
