'use client'

import { Suspense, useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, StickyNote, Check } from 'lucide-react'

function NotesPageContent() {
  const { status } = useSession()
  const router = useRouter()
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    fetch('/api/quick-notes')
      .then((r) => r.json())
      .then((d) => {
        setContent(d.content ?? '')
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const save = useCallback(async (text: string) => {
    setSaving(true)
    try {
      await fetch('/api/quick-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      setSavedAt(Date.now())
    } catch {
      // silently fail — next keystroke will retry
    } finally {
      setSaving(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setContent(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(text), 800)
  }

  // Flash the saved indicator briefly
  useEffect(() => {
    if (savedAt === null) return
    const t = setTimeout(() => setSavedAt(null), 2000)
    return () => clearTimeout(t)
  }, [savedAt])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent">
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">notes</span>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="font-mono text-[10px] text-muted-foreground">saving…</span>
            )}
            {savedAt && !saving && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 font-mono text-[10px] text-primary"
              >
                <Check className="h-3 w-3" />
                saved
              </motion.span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {!loaded ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Notes</h2>
            </div>
            <textarea
              value={content}
              onChange={handleChange}
              placeholder="Write anything — ideas, todos, reminders…"
              className="min-h-[60vh] w-full resize-y rounded border border-border bg-surface-elevated px-4 py-4 font-sans text-sm leading-relaxed text-foreground placeholder-muted-foreground/40 focus:border-primary/30 focus:outline-none"
              autoFocus
            />
            <p className="text-center font-mono text-[10px] text-muted-foreground/50">
              Changes auto-save as you type
            </p>
          </motion.div>
        )}
      </main>
    </div>
  )
}

export default function NotesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface-base">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <NotesPageContent />
    </Suspense>
  )
}
