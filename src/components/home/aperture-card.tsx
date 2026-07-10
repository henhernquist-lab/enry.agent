'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Aperture, Check, Loader2, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { loadResources, updateResource, type Resource, type AperturePayload } from '@/lib/resources'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// The Aperture homepage card: shows today's single question. Answering saves
// and collapses the card to a checkmark row. If unanswered, it persists.
export function ApertureCard() {
  const [resource, setResource] = useState<Resource<AperturePayload> | null>(null)
  const [loading, setLoading] = useState(true)
  const [answer, setAnswer] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadResources('aperture')
      .then((rows) => {
        const list = rows as Resource<AperturePayload>[]
        // Prefer today's question; fall back to the most recent unanswered one.
        const today = list.find((r) => r.payload?.date === todayISO())
        const chosen = today ?? list.find((r) => !r.payload?.answer) ?? null
        setResource(chosen)
        setAnswer(chosen?.payload?.answer ?? '')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleAnswer = async () => {
    if (!resource || !answer.trim()) return
    setSaving(true)
    const payload: AperturePayload = {
      ...resource.payload,
      answer: answer.trim(),
      answered_at: new Date().toISOString(),
    }
    const updated = await updateResource(resource.id, 'aperture', resource.payload.question.slice(0, 200), payload)
    if (updated) setResource({ ...resource, payload })
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg border border-border bg-surface-secondary">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!resource) {
    return (
      <div className="flex h-full min-h-[180px] flex-col justify-center rounded-lg border border-border bg-surface-secondary p-5">
        <div className="mb-2 flex items-center gap-2">
          <Aperture className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">The Aperture</span>
        </div>
        <p className="text-sm text-muted-foreground">Today&apos;s question hasn&apos;t been generated yet. Check back in the morning.</p>
      </div>
    )
  }

  const answered = !!resource.payload.answer

  return (
    <motion.div
      layout
      className="flex h-full flex-col rounded-lg border border-primary/40 bg-surface-secondary p-5 shadow-sm shadow-black/20"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Aperture className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">The Aperture</span>
        </div>
        <Link
          href="/resources/aperture"
          className="flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          archive <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <AnimatePresence mode="wait">
        {answered ? (
          <motion.div
            key="answered"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-1 flex-col justify-center gap-2"
          >
            <div className="flex items-center gap-2 text-primary">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15">
                <Check className="h-3 w-3" />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider">Answered today</span>
            </div>
            <p className="text-sm leading-snug text-foreground/90">{resource.payload.question}</p>
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{resource.payload.answer}</p>
          </motion.div>
        ) : (
          <motion.div key="asking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col">
            <p className="mb-3 text-[15px] font-medium leading-snug text-foreground">{resource.payload.question}</p>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Answer in 2–5 sentences…"
              className="min-h-[64px] flex-1 resize-none rounded-md border border-border bg-surface-base p-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
            />
            <button
              onClick={handleAnswer}
              disabled={saving || !answer.trim()}
              className="mt-2 inline-flex items-center justify-center gap-1.5 self-end rounded-md bg-primary px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-surface-base transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Answer
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
