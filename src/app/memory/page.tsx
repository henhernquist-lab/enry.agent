'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Brain,
  Search,
  X,
  Trash2,
  Loader2,
  Import,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import type { Resource, MemoryPayload } from '@/lib/resources'

type MemoryResource = Resource<MemoryPayload>

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function sourceLabel(m: MemoryResource): string {
  const p = m.payload
  if (p.imported) return p.origin ? `imported · ${p.origin}` : 'imported'
  return 'captured'
}

// ─── Import modal ─────────────────────────────────────────────────────────────

const ORIGINS = ['ChatGPT', 'Claude', 'Gemini', 'Other']

function ImportMemoryModal({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: (m: MemoryResource) => void
}) {
  const [content, setContent] = useState('')
  const [origin, setOrigin] = useState<string>(ORIGINS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Click-outside close — mousedown listener on document, scoped to the
  // backdrop ref (matches the pattern in center-panel.tsx).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.target === backdropRef.current) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    const text = content.trim()
    if (!text) {
      setError('Paste something to import.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, origin, imported: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Import failed.')
        setSaving(false)
        return
      }
      onImported(data.memory as MemoryResource)
      onClose()
    } catch {
      setError('Network error. Try again.')
      setSaving(false)
    }
  }, [content, origin, onImported, onClose])

  return (
    <motion.div
      ref={backdropRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-full max-w-2xl rounded-t border border-border bg-surface-secondary p-6 sm:rounded"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Import className="h-4 w-4 text-primary" />
            Import Memory from Other AIs
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Paste memory, custom instructions, or context exported from another AI. Enry will store it and use it going forward.
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Source
            </label>
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            >
              {ORIGINS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Memory / context
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste exported memory, custom instructions, or context here…"
              rows={10}
              autoFocus
              className="w-full resize-y rounded border border-border bg-surface-elevated px-3 py-2 font-mono text-xs leading-relaxed text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !content.trim()}
            className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Import className="h-3 w-3" />}
            Import
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Memory row ───────────────────────────────────────────────────────────────

function MemoryRow({
  memory,
  index,
  onDelete,
}: {
  memory: MemoryResource
  index: number
  onDelete: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const p = memory.payload
  const isLong = p.content.length > 200
  const snippet = expanded ? p.content : p.content.slice(0, 200)

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    await onDelete(memory.id)
    setDeleting(false)
  }, [memory.id, onDelete])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ delay: Math.min(index * 0.02, 0.25), type: 'spring', stiffness: 300, damping: 28 }}
      className="group rounded border border-border bg-surface-secondary transition-colors hover:border-border/80"
    >
      <button
        onClick={() => isLong && setExpanded((e) => !e)}
        className={`flex w-full items-start gap-3 p-3 text-left ${isLong ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div
          className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border ${
            p.imported
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-primary/30 bg-primary/10 text-primary'
          }`}
        >
          {p.imported ? <Import className="h-3 w-3" /> : <Brain className="h-3 w-3" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-xs leading-relaxed text-foreground ${expanded ? 'whitespace-pre-wrap' : ''}`}>
            {snippet}
            {!expanded && isLong && <span className="text-muted-foreground">…</span>}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                p.imported
                  ? 'border-accent/30 text-accent'
                  : 'border-primary/30 text-primary'
              }`}
            >
              {sourceLabel(memory)}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground">{fmtDate(memory.created_at)}</span>
          </div>
        </div>
      </button>
      <div className="flex justify-end px-3 pb-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-surface-elevated hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
          aria-label="Delete memory"
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </motion.div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryResource[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/memory')
      .then((r) => r.json())
      .then((d) => setMemories((d.memories ?? []) as MemoryResource[]))
      .catch(() => setError('Failed to load memories.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return memories
    const q = searchQuery.toLowerCase()
    return memories.filter((m) => {
      const p = m.payload
      return (
        p.content.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        (p.origin ?? '').toLowerCase().includes(q)
      )
    })
  }, [memories, searchQuery])

  const handleDelete = useCallback(async (id: string) => {
    // Optimistic remove — if the server delete fails, reload to restore.
    const prev = memories
    setMemories((m) => m.filter((x) => x.id !== id))
    try {
      const res = await fetch(`/api/memory?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        setMemories(prev)
        setError('Delete failed — reloaded list.')
      }
    } catch {
      setMemories(prev)
      setError('Network error on delete — reloaded list.')
    }
  }, [memories])

  const handleImported = useCallback((m: MemoryResource) => {
    setMemories((prev) => [m, ...prev])
  }, [])

  return (
    <div className="min-h-screen bg-transparent">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Chat
          </Link>
          <div className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              manage memory
            </span>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
              {memories.length}
            </span>
          </div>
          <div className="w-14" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Section 1: Everything Enry Knows */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Brain className="h-4 w-4 text-primary" />
              Everything Enry Knows
            </h1>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/15 px-3 py-1.5 font-mono text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
            >
              <Import className="h-3.5 w-3.5" />
              Import Memory from Other AIs
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories…"
              className="w-full rounded border border-border bg-surface-elevated py-2 pl-9 pr-8 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* List / states */}
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : memories.length === 0 ? (
            <div className="rounded border border-dashed border-border p-10 text-center">
              <Brain className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">No memories yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enry will remember things about you here. Import context from another AI to get started.
              </p>
              <button
                onClick={() => setShowImport(true)}
                className="mx-auto mt-4 flex items-center gap-1.5 rounded border border-primary/40 bg-primary/15 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
              >
                <Import className="h-3.5 w-3.5" />
                Import Memory
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No memories match &ldquo;{searchQuery}&rdquo;.
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {filtered.length} memor{filtered.length !== 1 ? 'ies' : 'y'}
                {searchQuery && ` · matching "${searchQuery}"`}
              </p>
              <AnimatePresence mode="popLayout">
                {filtered.map((m, i) => (
                  <MemoryRow key={m.id} memory={m} index={i} onDelete={handleDelete} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* Section 2: Import CTA (also reachable from the top button) */}
        <section>
          <div className="rounded border border-border bg-surface-secondary p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-accent/30 bg-accent/10 text-accent">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground">Import Memory from Other AIs</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Bring context you&apos;ve built in ChatGPT, Claude, Gemini, or elsewhere. Enry treats it as
                  first-class memory going forward.
                </p>
                <button
                  onClick={() => setShowImport(true)}
                  className="mt-3 flex items-center gap-1.5 rounded border border-primary/40 bg-primary/15 px-3 py-1.5 font-mono text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
                >
                  <Import className="h-3.5 w-3.5" />
                  Import Memory
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {showImport && (
          <ImportMemoryModal onClose={() => setShowImport(false)} onImported={handleImported} />
        )}
      </AnimatePresence>
    </div>
  )
}
