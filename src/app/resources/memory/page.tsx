'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Brain, MessageSquare, Check, Loader2, Save } from 'lucide-react'

export default function MemoryPage() {
  const { status } = useSession()
  const router = useRouter()

  const [memoryInput, setMemoryInput] = useState('')
  const [commPrefs, setCommPrefs] = useState('')
  const [saving, setSaving] = useState<'memory' | 'preference' | null>(null)
  const [saved, setSaved] = useState<'memory' | 'preference' | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const saveEntry = async (type: 'memory' | 'preference', content: string) => {
    if (!content.trim()) return
    setSaving(type)
    setSaved(null)
    try {
      const res = await fetch('/api/memory/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content }),
      })
      if (res.ok) {
        setSaved(type)
        if (type === 'memory') setMemoryInput('')
        else setCommPrefs('')
        setTimeout(() => setSaved(null), 2500)
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setSaving(null)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-5">
          <Link
            href="/resources"
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>[TOOLS]</span>
          </Link>

          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <Brain className="h-3 w-3 text-primary" />
            <span className="text-primary">MEMORY</span>
          </div>

          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 lg:px-12 lg:py-12">
        {/* Section label */}
        <div className="mb-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/40">
            /resources/memory
          </p>
        </div>

        <div className="mb-10">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-foreground">
            Memory
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Things you tell Enry here become part of its long-term memory —
            recalled automatically when relevant to a conversation.
          </p>
        </div>

        {/* Section 1: Things Enry should know */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-10"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded border border-border/40 bg-surface-elevated">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
              Things Enry should know about me
            </h2>
          </div>

          <div className="rounded border border-border bg-surface-secondary p-5">
            <textarea
              value={memoryInput}
              onChange={(e) => setMemoryInput(e.target.value)}
              placeholder="I'm a 14-year-old student-athlete. I sprint and lift. I'm building AI software. I take Algebra 2, Biology, CS..."
              rows={5}
              className="w-full resize-none rounded border border-border bg-surface-elevated px-4 py-3 font-mono text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              style={{ minHeight: '120px' }}
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="font-mono text-[10px] text-muted-foreground">
                Write anything — facts, preferences, context. Enry will recall it when relevant.
              </p>
              <button
                onClick={() => saveEntry('memory', memoryInput)}
                disabled={!memoryInput.trim() || saving === 'memory'}
                className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[10px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-elevated disabled:text-muted-foreground"
              >
                {saving === 'memory' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : saved === 'memory' ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {saved === 'memory' ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        </motion.section>

        {/* Section 2: Communication preferences */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded border border-border/40 bg-surface-elevated">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
              How should Enry talk to you?
            </h2>
          </div>

          <div className="rounded border border-border bg-surface-secondary p-5">
            <textarea
              value={commPrefs}
              onChange={(e) => setCommPrefs(e.target.value)}
              placeholder="Be concise and direct. Don't use fluff. Use technical language — I know what I'm doing. Ask before taking action rather than assuming. Explain things step by step when it's complex."
              rows={5}
              className="w-full resize-none rounded border border-border bg-surface-elevated px-4 py-3 font-mono text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              style={{ minHeight: '120px' }}
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="font-mono text-[10px] text-muted-foreground">
                Describe your preferred tone, depth, initiative level, and explanation style.
              </p>
              <button
                onClick={() => saveEntry('preference', commPrefs)}
                disabled={!commPrefs.trim() || saving === 'preference'}
                className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[10px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-elevated disabled:text-muted-foreground"
              >
                {saving === 'preference' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : saved === 'preference' ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {saved === 'preference' ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        </motion.section>

        {/* How it works */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-6 border-t border-border/20 pt-6"
        >
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40">
            How it works
          </p>
          <ul className="mt-2 space-y-1.5">
            <li className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-0.5 font-mono text-[10px] text-primary">1</span>
              <span>Everything you save here is embedded and stored in Enry&apos;s vector memory.</span>
            </li>
            <li className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-0.5 font-mono text-[10px] text-primary">2</span>
              <span>When you ask a question, Enry automatically searches for relevant memories.</span>
            </li>
            <li className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-0.5 font-mono text-[10px] text-primary">3</span>
              <span>Communication preferences are injected into every conversation — Enry adapts its style to match.</span>
            </li>
          </ul>
        </motion.footer>
      </main>
    </div>
  )
}
