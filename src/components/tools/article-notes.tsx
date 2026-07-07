'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Link2,
  Loader2,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  Eye,
  EyeOff,
  ChevronRight,
  RotateCcw,
  Shuffle,
  ArrowRight,
  Newspaper,
  Search,
  X,
  Brain,
} from 'lucide-react'
import type { Resource, ArticleNotePayload } from '@/lib/resources'
import { isArchived, type ResourceSource } from '@/lib/resource-source'

// ─── Types ────────────────────────────────────────────────────────────────────

type IngestStatus = 'idle' | 'loading' | 'success' | 'error'

const STEPS = [
  'Fetching article…',
  'Extracting content…',
  'Generating notes…',
  'Saving…',
]

const STEP_DELAYS = [0, 1500, 3000, 6500]

// ─── ArticleNotes (ingest tool) ───────────────────────────────────────────────

interface ArticleNotesProps {
  onClose: () => void
  mode: 'page' | 'modal'
  onSave: () => void
}

export function ArticleNotes({ onSave }: ArticleNotesProps) {
  const [url, setUrl] = useState('')
  const [userNote, setUserNote] = useState('')
  const [status, setStatus] = useState<IngestStatus>('idle')
  const [stepIdx, setStepIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [savedResource, setSavedResource] = useState<Resource<ArticleNotePayload> | null>(null)

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const handleSubmit = useCallback(async () => {
    const trimmed = url.trim()
    if (!trimmed) return

    try {
      new URL(trimmed)
    } catch {
      setError('Enter a valid URL starting with http:// or https://')
      return
    }

    setStatus('loading')
    setStepIdx(0)
    setElapsed(0)
    setError(null)
    clearTimers()

    // Animate progress steps on a timer (doesn't reflect actual server stages)
    STEP_DELAYS.slice(1).forEach((delay, i) => {
      const t = setTimeout(() => setStepIdx(i + 1), delay)
      timersRef.current.push(t)
    })
    intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)

    try {
      const res = await fetch('/api/article-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, user_note: userNote.trim() || undefined }),
      })
      const data = await res.json()
      clearTimers()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Try again.')
        setStatus('error')
        return
      }

      setSavedResource(data.resource as Resource<ArticleNotePayload>)
      setStatus('success')
      onSave()
    } catch {
      clearTimers()
      setError('Network error. Check your connection and try again.')
      setStatus('error')
    }
  }, [url, userNote, onSave])

  const handleReset = () => {
    clearTimers()
    setStatus('idle')
    setUrl('')
    setUserNote('')
    setError(null)
    setSavedResource(null)
    setStepIdx(0)
  }

  useEffect(() => () => clearTimers(), [])

  // ── Loading state ───────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="rounded border border-border bg-surface-secondary p-6">
        <div className="mb-4 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="font-mono text-xs text-primary">Processing</span>
          <span className="font-mono text-xs text-muted-foreground">{elapsed}s</span>
        </div>
        <div className="space-y-2">
          {STEPS.map((step, i) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: i <= stepIdx ? 1 : 0.25, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-2"
            >
              {i < stepIdx ? (
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
              ) : i === stepIdx ? (
                <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-primary" />
              ) : (
                <div className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-border" />
              )}
              <span className={`text-xs ${i <= stepIdx ? 'text-foreground' : 'text-muted-foreground'}`}>
                {step}
              </span>
            </motion.div>
          ))}
        </div>
        <p className="mt-4 font-mono text-[10px] text-muted-foreground">
          {elapsed < 20 ? 'This usually takes 5–15 seconds' : 'Still working — longer articles can take a bit more time'}
        </p>
      </div>
    )
  }

  // ── Success state ────────────────────────────────────────────────────────
  if (status === 'success' && savedResource) {
    const p = savedResource.payload as ArticleNotePayload
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded border border-primary/30 bg-primary/5 p-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="text-xs font-medium text-primary">Saved</span>
          </div>
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary"
          >
            {p.source_domain} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
        <p className="mb-2 text-sm font-medium text-foreground">{p.article_title}</p>
        {p.processing_failed ? (
          <p className="text-xs text-warning">Note generation failed — the article was saved but is missing the summary and flashcards. You can delete it and retry.</p>
        ) : (
          <>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{p.summary}</p>
            <div className="flex gap-3 font-mono text-[10px] text-muted-foreground">
              <span>{p.key_claims.length} claims</span>
              <span>{p.flashcards.length} flashcards</span>
              {p.tags.length > 0 && <span>{p.tags.join(', ')}</span>}
            </div>
          </>
        )}
        <button
          onClick={handleReset}
          className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Save another
        </button>
      </motion.div>
    )
  }

  // ── Idle / Error state (default form) ───────────────────────────────────
  return (
    <div className="rounded border border-border bg-surface-secondary p-5">
      <div className="mb-4 flex items-center gap-2">
        <Newspaper className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Article → Notes</h3>
      </div>

      <div className="space-y-3">
        {/* URL input — the hero */}
        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Article URL
          </label>
          <div className="relative flex items-center">
            <Link2 className="absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="https://example.com/article"
              className="w-full rounded border border-border bg-surface-elevated py-2.5 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
              autoFocus
            />
          </div>
        </div>

        {/* Optional note */}
        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Why you saved this (optional)
          </label>
          <textarea
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="e.g. interesting take on zone 2 training"
            rows={2}
            className="w-full resize-none rounded border border-border bg-surface-elevated px-3 py-2 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded border border-[#ff4d4d]/30 bg-[#ff4d4d]/8 px-3 py-2 text-xs text-[#ff4d4d]">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!url.trim()}
          className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/15 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Generate Notes
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-3 font-mono text-[10px] text-muted-foreground">
        Fetches the full article · generates summary, key claims, and flashcards · saves to your library
      </p>
    </div>
  )
}

// ─── ArticleNoteDetail (rendered inside the existing DetailModal) ─────────────

interface ArticleNoteDetailProps {
  resource: Resource<ArticleNotePayload>
  onStudyThis: (cards: { q: string; a: string }[]) => void
}

export function ArticleNoteDetail({ resource, onStudyThis }: ArticleNoteDetailProps) {
  const p = resource.payload as ArticleNotePayload
  const [revealed, setRevealed] = useState<Set<number>>(new Set())

  const toggleReveal = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <a
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1 inline-flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
        >
          {p.source_domain} <ExternalLink className="h-2.5 w-2.5" />
        </a>
        {p.author && <p className="font-mono text-[10px] text-muted-foreground">by {p.author}</p>}
        {p.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {p.tags.map((t) => (
              <span key={t} className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* User note */}
      {p.user_note && (
        <div className="rounded border border-accent/20 bg-accent/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {p.user_note}
        </div>
      )}

      {/* Processing failed notice */}
      {p.processing_failed && (
        <div className="flex items-start gap-2 rounded border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-warning">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Note generation failed for this article.
        </div>
      )}

      {/* Summary */}
      {p.summary && (
        <div>
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Summary</p>
          <p className="text-xs leading-relaxed text-foreground">{p.summary}</p>
        </div>
      )}

      {/* Key claims */}
      {p.key_claims.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Key Claims · {p.key_claims.length}
          </p>
          <ol className="space-y-1.5">
            {p.key_claims.map((claim, i) => (
              <li key={i} className="flex gap-2 text-xs text-foreground">
                <span className="mt-0.5 flex-shrink-0 font-mono text-[10px] text-muted-foreground">{i + 1}.</span>
                <span className="leading-relaxed">{claim}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Flashcards */}
      {p.flashcards.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              Flashcards · {p.flashcards.length}
            </p>
            <button
              onClick={() => onStudyThis(p.flashcards)}
              className="flex items-center gap-1 rounded border border-primary/30 bg-primary/8 px-2 py-0.5 font-mono text-[10px] text-primary transition-colors hover:bg-primary/15"
            >
              <Brain className="h-2.5 w-2.5" />
              Study these
            </button>
          </div>
          <div className="space-y-1.5">
            {p.flashcards.map((fc, i) => (
              <div key={i} className="rounded border border-border bg-surface-elevated p-3">
                <p className="text-xs font-medium text-foreground">{fc.q}</p>
                <AnimatePresence>
                  {revealed.has(i) && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-1.5 text-xs text-muted-foreground"
                    >
                      {fc.a}
                    </motion.p>
                  )}
                </AnimatePresence>
                <button
                  onClick={() => toggleReveal(i)}
                  className="mt-2 flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary"
                >
                  {revealed.has(i) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {revealed.has(i) ? 'Hide' : 'Reveal'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ArticleNoteCard (for saved list) ────────────────────────────────────────

interface ArticleNoteCardProps {
  resource: Resource<ArticleNotePayload>
  onOpen: (r: Resource<ArticleNotePayload>) => void
  onDelete: (id: string) => void
}

export function ArticleNoteCard({ resource, onOpen, onDelete }: ArticleNoteCardProps) {
  const p = resource.payload as ArticleNotePayload
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(true)
    await fetch(`/api/resources/${resource.id}`, { method: 'DELETE' })
    onDelete(resource.id)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      onClick={() => onOpen(resource)}
      className="group cursor-pointer rounded border border-border/60 bg-surface-elevated/60 p-3 transition-all duration-200 hover:border-primary/30 hover:bg-surface-elevated hover:shadow-sm"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{p.article_title}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
            title="Open original article"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-[#ff4d4d] group-hover:opacity-100 disabled:opacity-40"
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Domain + meta */}
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
          {p.source_domain}
        </span>
        {p.flashcards.length > 0 && (
          <span className="font-mono text-[9px] text-muted-foreground">
            {p.flashcards.length} card{p.flashcards.length !== 1 ? 's' : ''}
          </span>
        )}
        {p.processing_failed && (
          <span className="font-mono text-[9px] text-warning">processing failed</span>
        )}
      </div>

      {/* Summary preview */}
      {p.summary && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{p.summary}</p>
      )}

      {/* Tags */}
      {p.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.tags.slice(0, 4).map((t) => (
            <span key={t} className="rounded border border-border/50 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/70">{t}</span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          Click to view ·
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </motion.div>
  )
}

// ─── ArticleNotesSavedList ────────────────────────────────────────────────────

interface ArticleNotesSavedListProps {
  refreshKey: number
  onStudyAll: (cards: { q: string; a: string }[]) => void
  source?: ResourceSource
  excludeArchived?: boolean
}

export function ArticleNotesSavedList({ refreshKey, onStudyAll, source = 'user', excludeArchived = false }: ArticleNotesSavedListProps) {
  const [items, setItems] = useState<Resource<ArticleNotePayload>[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Resource<ArticleNotePayload> | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [semanticResults, setSemanticResults] = useState<Resource<ArticleNotePayload>[] | null>(null)
  const [isSemanticResult, setIsSemanticResult] = useState(false)
  const [studyTarget, setStudyTarget] = useState<{ q: string; a: string }[] | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/resources?type=article_note&source=${source}`)
      .then((r) => r.json())
      .then((d) => setItems(d.resources ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [refreshKey, source])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (searchQuery.trim().length <= 3) {
      setSemanticResults(null)
      setIsSemanticResult(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch('/api/article-notes/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery, source }),
        })
        const data = await res.json()
        if (res.ok) {
          setSemanticResults(data.resources ?? [])
          setIsSemanticResult(data.semantic === true)
        }
      } catch {
        setSemanticResults(null)
      } finally {
        setSearching(false)
      }
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery, source])

  const scoped = excludeArchived ? items.filter((r) => !isArchived(r.created_at)) : items

  const displayed = semanticResults !== null ? semanticResults : (
    searchQuery.trim()
      ? scoped.filter((r) => {
          const p = r.payload as ArticleNotePayload
          const q = searchQuery.toLowerCase()
          return (
            p.article_title.toLowerCase().includes(q) ||
            p.source_domain.toLowerCase().includes(q) ||
            p.summary.toLowerCase().includes(q) ||
            p.tags.some((t) => t.includes(q))
          )
        })
      : scoped
  )

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    if (selected?.id === id) setSelected(null)
  }, [selected])

  const allFlashcards = scoped.flatMap((r) => (r.payload as ArticleNotePayload).flashcards ?? [])

  return (
    <>
      {/* Study all button + search */}
      <div className="mb-3 flex items-center gap-2">
        {allFlashcards.length > 0 && (
          <button
            onClick={() => onStudyAll(allFlashcards)}
            className="flex items-center gap-1.5 rounded border border-primary/30 bg-primary/8 px-2.5 py-1.5 font-mono text-[10px] text-primary transition-colors hover:bg-primary/15"
          >
            <Brain className="h-3 w-3" />
            Study all flashcards ({allFlashcards.length})
          </button>
        )}

        <div className="relative flex-1">
          {searching
            ? <Loader2 className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted-foreground" />
            : <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          }
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles…"
            className="w-full rounded border border-border bg-surface-elevated py-1.5 pl-8 pr-7 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSemanticResults(null) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {isSemanticResult && (
        <p className="mb-2 flex items-center gap-1 font-mono text-[10px] text-accent">
          <Brain className="h-2.5 w-2.5" /> semantic search
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {searchQuery ? 'No articles match your search.' : 'No saved articles yet.'}
        </p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {displayed.map((r) => (
              <ArticleNoteCard
                key={r.id}
                resource={r}
                onOpen={setSelected}
                onDelete={handleDelete}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded border border-border bg-surface-secondary p-5 shadow-2xl scrollbar-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute left-3 top-3 flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h3 className="mb-1 px-6 text-sm font-semibold text-foreground">
                {(selected.payload as ArticleNotePayload).article_title}
              </h3>
              <p className="mb-4 px-6 font-mono text-[10px] text-muted-foreground">
                {new Date(selected.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <ArticleNoteDetail
                resource={selected}
                onStudyThis={(cards) => {
                  setStudyTarget(cards)
                  setSelected(null)
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline study session (launched from detail or study-all) */}
      <AnimatePresence>
        {studyTarget && (
          <StudySession
            cards={studyTarget}
            onClose={() => setStudyTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── StudySession (full-screen flashcard review) ──────────────────────────────

interface StudySessionProps {
  cards: { q: string; a: string }[]
  onClose: () => void
}

export function StudySession({ cards: initialCards, onClose }: StudySessionProps) {
  const [deck, setDeck] = useState<{ q: string; a: string }[]>(() => shuffle([...initialCards]))
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(false)

  const card = deck[idx]
  const progress = `${idx + 1} / ${deck.length}`

  const next = () => {
    setRevealed(false)
    if (idx + 1 >= deck.length) {
      setDone(true)
    } else {
      setIdx((i) => i + 1)
    }
  }

  const restart = () => {
    setDeck(shuffle([...initialCards]))
    setIdx(0)
    setRevealed(false)
    setDone(false)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (!revealed) setRevealed(true)
        else next()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, idx, onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface-base p-6"
    >
      <div className="mb-6 flex w-full max-w-lg items-center justify-between">
        <button onClick={onClose} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Exit
        </button>
        <span className="font-mono text-[10px] text-muted-foreground">{done ? 'Done' : progress}</span>
        <button onClick={restart} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Shuffle className="h-3.5 w-3.5" /> Shuffle
        </button>
      </div>

      <div className="w-full max-w-lg">
        {done ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded border border-primary/30 bg-primary/8 p-8 text-center"
          >
            <Check className="mx-auto mb-3 h-8 w-8 text-primary" />
            <p className="text-sm font-semibold text-foreground">All done — {deck.length} cards reviewed</p>
            <div className="mt-4 flex justify-center gap-3">
              <button
                onClick={restart}
                className="flex items-center gap-1.5 rounded border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Go again
              </button>
              <button
                onClick={onClose}
                className="rounded border border-primary/40 bg-primary/15 px-4 py-2 text-xs text-primary hover:bg-primary/25"
              >
                Close
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded border border-border bg-surface-secondary p-6"
          >
            {/* Progress bar */}
            <div className="mb-5 h-0.5 w-full rounded-full bg-border">
              <div
                className="h-0.5 rounded-full bg-primary transition-all duration-300"
                style={{ width: `${((idx + 1) / deck.length) * 100}%` }}
              />
            </div>

            <p className="mb-6 text-sm font-medium leading-relaxed text-foreground">{card.q}</p>

            <AnimatePresence>
              {revealed ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 rounded border border-border/50 bg-surface-elevated px-4 py-3 text-xs leading-relaxed text-muted-foreground"
                >
                  {card.a}
                </motion.div>
              ) : (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => setRevealed(true)}
                  className="mb-6 flex w-full items-center justify-center gap-2 rounded border border-border bg-surface-elevated py-3 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <Eye className="h-3.5 w-3.5" /> Reveal answer
                </motion.button>
              )}
            </AnimatePresence>

            {revealed && (
              <button
                onClick={next}
                className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/15 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/25"
              >
                {idx + 1 < deck.length ? <>Next <ChevronRight className="h-4 w-4" /></> : 'Finish'}
              </button>
            )}

            <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground">
              Space or → to advance
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
