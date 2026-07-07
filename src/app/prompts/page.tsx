'use client'

import { Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Check,
  Search,
  X,
  Code2,
  PenLine,
  BookOpen,
  Dumbbell,
  Sparkles,
  Loader2,
  Tag,
  Plus,
  Pencil,
  Trash2,
  Library,
  BookMarked,
  Clock,
  ArrowUpDown,
  AlertCircle,
  Brain,
  Sun,
  Archive,
} from 'lucide-react'
import type { Resource, PromptPayload } from '@/lib/resources'
import { isArchived, type ResourceSource } from '@/lib/resource-source'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { id: PromptPayload['category']; label: string; icon: typeof Code2 }[] = [
  { id: 'coding',   label: 'Coding',   icon: Code2 },
  { id: 'writing',  label: 'Writing',  icon: PenLine },
  { id: 'study',    label: 'Study',    icon: BookOpen },
  { id: 'training', label: 'Training', icon: Dumbbell },
  { id: 'general',  label: 'General',  icon: Sparkles },
]

const CATEGORY_ICONS: Record<string, typeof Code2> = {
  coding: Code2, writing: PenLine, study: BookOpen, training: Dumbbell, general: Sparkles,
}

const TAG_COLORS = [
  'border-[#00ff66]/20 text-[#00ff66]/70',
  'border-[#00c8ff]/20 text-[#00c8ff]/70',
  'border-[#ffb800]/20 text-[#ffb800]/70',
  'border-[#ff4d4d]/20 text-[#ff4d4d]/70',
  'border-[#a78bfa]/20 text-[#a78bfa]/70',
  'border-[#f472b6]/20 text-[#f472b6]/70',
  'border-[#34d399]/20 text-[#34d399]/70',
  'border-[#fb923c]/20 text-[#fb923c]/70',
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
const tagColor = (t: string) => TAG_COLORS[hashStr(t) % TAG_COLORS.length]

function catStyle(cat: string): string {
  switch (cat) {
    case 'coding':   return 'text-[#00ff66] border-[#00ff66]/30 bg-[#00ff66]/8'
    case 'writing':  return 'text-[#00c8ff] border-[#00c8ff]/30 bg-[#00c8ff]/8'
    case 'study':    return 'text-[#ffb800] border-[#ffb800]/30 bg-[#ffb800]/8'
    case 'training': return 'text-[#ff4d4d] border-[#ff4d4d]/30 bg-[#ff4d4d]/8'
    case 'general':  return 'text-[#a78bfa] border-[#a78bfa]/30 bg-[#a78bfa]/8'
    default:         return 'text-muted-foreground border-border bg-surface-elevated'
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text, onCopy }: { text: string; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
    onCopy?.()
  }, [text, onCopy])

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-[10px] font-medium transition-all duration-200 ${
        copied
          ? 'border border-primary/40 bg-primary/15 text-primary'
          : 'border border-border bg-surface-elevated text-muted-foreground hover:border-primary/30 hover:text-primary'
      }`}
    >
      {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
    </button>
  )
}

// ─── Prompt card (used by Main / Daily / Mine) ────────────────────────────────

export type UserPrompt = Resource<PromptPayload>

export function PromptCard({
  prompt,
  index,
  onEdit,
  onDelete,
}: {
  prompt: UserPrompt
  index: number
  onEdit?: (p: UserPrompt) => void
  onDelete?: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const p = prompt.payload as PromptPayload
  const style = catStyle(p.category ?? 'general')
  const Icon = CATEGORY_ICONS[p.category ?? 'general'] ?? Sparkles

  const handleCopy = useCallback(() => {
    fetch(`/api/resources/${prompt.id}`, { method: 'PATCH' }).catch(console.error)
  }, [prompt.id])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    await fetch(`/api/resources/${prompt.id}`, { method: 'DELETE' })
    onDelete?.(prompt.id)
  }, [prompt.id, onDelete])

  const snippet = p.body.slice(0, 180).replace(/\n/g, ' ').trim()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ delay: index * 0.02, type: 'spring', stiffness: 300, damping: 28 }}
      className="overflow-hidden rounded border border-border bg-surface-secondary transition-colors duration-200 hover:border-border/80"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={expanded}
      >
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border ${style}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">{prompt.title}</h3>
            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(prompt) }}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
                  aria-label="Edit"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete() }}
                  disabled={deleting}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-[#ff4d4d]"
                  aria-label="Delete"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </button>
              )}
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
            </div>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{snippet}…</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${style}`}>
              {p.category ?? 'general'}
            </span>
            {(p.tags ?? []).slice(0, 3).map((t) => (
              <span key={t} className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${tagColor(t)}`}>{t}</span>
            ))}
            {(p.tags ?? []).length > 3 && (
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                +{(p.tags ?? []).length - 3}
              </span>
            )}
            {(p.use_count ?? 0) > 0 && (
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                used {p.use_count}×
              </span>
            )}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/50 px-4 pb-4 pt-3">
              {p.notes && (
                <div className="mb-3 flex items-start gap-2 rounded border border-accent/20 bg-accent/5 px-2.5 py-2">
                  <Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0 text-accent" />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{p.notes}</p>
                </div>
              )}
              <div className="mb-3 max-h-80 overflow-y-auto rounded border border-border/50 bg-surface-base p-3 font-mono text-[11px] leading-relaxed text-foreground scrollbar-hidden whitespace-pre-wrap">
                {p.body}
              </div>
              <div className="flex items-center justify-between">
                <CopyButton text={p.body} onCopy={handleCopy} />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {fmtDate(prompt.updated_at)}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Prompt form modal ────────────────────────────────────────────────────────

interface FormValues {
  title: string
  category: PromptPayload['category']
  tags: string
  body: string
  notes: string
}

const EMPTY_FORM: FormValues = { title: '', category: 'general', tags: '', body: '', notes: '' }

function PromptFormModal({
  initial,
  editId,
  onClose,
  onSaved,
}: {
  initial?: FormValues
  editId?: string
  onClose: () => void
  onSaved: (r: UserPrompt) => void
}) {
  const [form, setForm] = useState<FormValues>(initial ?? EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = useCallback(async () => {
    if (!form.title.trim()) { setError('Title is required.'); return }
    if (!form.body.trim()) { setError('Body is required.'); return }

    setSaving(true)
    setError(null)

    const payload: PromptPayload = {
      body: form.body.trim(),
      category: form.category,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      notes: form.notes.trim() || undefined,
    }

    const url = editId ? `/api/resources/${editId}` : '/api/resources'
    const method = editId ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'prompt', title: form.title.trim(), payload }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed.'); setSaving(false); return }
      onSaved(data.resource as UserPrompt)
      onClose()
    } catch {
      setError('Network error. Try again.')
      setSaving(false)
    }
  }, [form, editId, onSaved, onClose])

  return (
    <motion.div
      ref={backdropRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        className="w-full max-w-2xl rounded-t border border-border bg-surface-secondary p-6 sm:rounded"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            {editId ? 'Edit Prompt' : 'New Prompt'}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-elevated hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Title *</label>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Debug + Explain"
              className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Category</label>
              <select
                value={form.category}
                onChange={(e) => set('category', e.target.value as PromptPayload['category'])}
                className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Tags (comma-separated)</label>
              <input
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                placeholder="debug, typescript, testing"
                className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Body *</label>
            <textarea
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              placeholder="The prompt text — use [BRACKETS] for fill-in sections…"
              rows={8}
              className="w-full resize-y rounded border border-border bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Notes (optional)</label>
            <input
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="When to use this, what it's best for…"
              className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded border border-[#ff4d4d]/30 bg-[#ff4d4d]/10 px-3 py-2 text-xs text-[#ff4d4d]">
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
            disabled={saving}
            className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {editId ? 'Save Changes' : 'Save Prompt'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Generic prompt list tab (Main / Daily / Mine share this) ────────────────

type SortKey = 'recent' | 'most-used' | 'alpha'

function PromptListTab({
  source,
  allowCreate = false,
  allowEdit = false,
  allowDelete = false,
  excludeArchived = false,
  archiveHref,
  emptyTitle,
  emptyDesc,
}: {
  source: ResourceSource
  allowCreate?: boolean
  allowEdit?: boolean
  allowDelete?: boolean
  excludeArchived?: boolean
  archiveHref?: string
  emptyTitle: string
  emptyDesc: string
}) {
  const [prompts, setPrompts] = useState<UserPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [isSemanticResult, setIsSemanticResult] = useState(false)
  const [sortBy, setSortBy] = useState<SortKey>('recent')
  const [categoryFilter, setCategoryFilter] = useState<PromptPayload['category'] | null>(null)
  const [formMode, setFormMode] = useState<null | 'create' | 'edit'>(null)
  const [editTarget, setEditTarget] = useState<UserPrompt | null>(null)
  const [semanticResults, setSemanticResults] = useState<UserPrompt[] | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/resources?type=prompt&source=${source}`)
      .then((r) => r.json())
      .then((d) => setPrompts(d.resources ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [source])

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
        const res = await fetch('/api/prompts/search', {
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

  const scoped = excludeArchived ? prompts.filter((p) => !isArchived(p.created_at)) : prompts

  const displayed = useMemo(() => {
    let items = semanticResults !== null ? semanticResults : scoped

    if (semanticResults === null && searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter((p) => {
        const pp = p.payload as PromptPayload
        return (
          p.title.toLowerCase().includes(q) ||
          pp.body.toLowerCase().includes(q) ||
          (pp.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
          (pp.notes ?? '').toLowerCase().includes(q)
        )
      })
    }

    if (categoryFilter) {
      items = items.filter((p) => (p.payload as PromptPayload).category === categoryFilter)
    }

    if (semanticResults === null) {
      items = [...items].sort((a, b) => {
        if (sortBy === 'most-used') return ((b.payload as PromptPayload).use_count ?? 0) - ((a.payload as PromptPayload).use_count ?? 0)
        if (sortBy === 'alpha') return a.title.localeCompare(b.title)
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      })
    }

    return items
  }, [scoped, semanticResults, searchQuery, categoryFilter, sortBy])

  const openCreate = () => { setEditTarget(null); setFormMode('create') }
  const openEdit = (p: UserPrompt) => { setEditTarget(p); setFormMode('edit') }
  const closeForm = () => { setFormMode(null); setEditTarget(null) }

  const handleSaved = useCallback((r: UserPrompt) => {
    setPrompts((prev) => {
      const idx = prev.findIndex((p) => p.id === r.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = r; return next }
      return [r, ...prev]
    })
  }, [])

  const handleDelete = useCallback((id: string) => {
    setPrompts((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const editInitial = editTarget ? {
    title: editTarget.title,
    category: (editTarget.payload as PromptPayload).category ?? 'general',
    tags: ((editTarget.payload as PromptPayload).tags ?? []).join(', '),
    body: (editTarget.payload as PromptPayload).body ?? '',
    notes: (editTarget.payload as PromptPayload).notes ?? '',
  } : undefined

  return (
    <>
      <div className="sticky top-[88px] z-10 border-b border-border/50 bg-surface-base">
        <div className="px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <div className="relative flex-1">
              {searching
                ? <Loader2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                : <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              }
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search — semantic kicks in after 3 chars…"
                className="w-full rounded border border-border bg-surface-elevated py-2 pl-9 pr-8 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSemanticResults(null) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 rounded border border-border bg-surface-elevated px-1">
              {(['recent', 'most-used', 'alpha'] as SortKey[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`rounded px-2 py-1 font-mono text-[10px] transition-colors ${sortBy === s ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  title={{ recent: 'Recent', 'most-used': 'Most used', alpha: 'A–Z' }[s]}
                >
                  {s === 'recent' ? <Clock className="h-3 w-3" /> : s === 'most-used' ? <ArrowUpDown className="h-3 w-3" /> : 'A-Z'}
                </button>
              ))}
            </div>

            {allowCreate && (
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/15 px-3 py-1.5 font-mono text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            )}
            {archiveHref && (
              <Link
                href={archiveHref}
                className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </Link>
            )}
          </div>

          <div className="mx-auto mt-2 flex max-w-3xl gap-1.5 overflow-x-auto scrollbar-hidden">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`flex-shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${categoryFilter === null ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
                className={`flex-shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${categoryFilter === c.id ? catStyle(c.id) : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : prompts.length === 0 && !searchQuery ? (
          <div className="py-16 text-center">
            <BookMarked className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">{emptyDesc}</p>
            {allowCreate && (
              <button
                onClick={openCreate}
                className="mx-auto mt-4 flex items-center gap-1.5 rounded border border-primary/40 bg-primary/15 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
              >
                <Plus className="h-3.5 w-3.5" />
                Save your first prompt
              </button>
            )}
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">No prompts match your search.</p>
            <button
              onClick={() => { setSearchQuery(''); setCategoryFilter(null); setSemanticResults(null) }}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {displayed.length} prompt{displayed.length !== 1 ? 's' : ''}
              {isSemanticResult && (
                <span className="flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 normal-case tracking-normal text-accent">
                  <Brain className="h-2.5 w-2.5" /> semantic
                </span>
              )}
            </p>
            <AnimatePresence mode="popLayout">
              {displayed.map((p, i) => (
                <PromptCard
                  key={p.id}
                  prompt={p}
                  index={i}
                  onEdit={allowEdit ? openEdit : undefined}
                  onDelete={allowDelete ? handleDelete : undefined}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <AnimatePresence>
        {formMode && (
          <PromptFormModal
            initial={editInitial}
            editId={editTarget?.id}
            onClose={closeForm}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

type TabId = 'main' | 'daily' | 'mine'

function PromptsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawTab = searchParams.get('tab')
  const activeTab = ((rawTab === 'daily' || rawTab === 'mine') ? rawTab : 'main') as TabId

  const setTab = (tab: TabId) => {
    router.replace(tab === 'main' ? '/prompts' : `/prompts?tab=${tab}`)
  }

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Chat
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">prompt library</span>
          <div className="w-14" />
        </div>

        {/* Tab row */}
        <div className="flex overflow-x-auto border-t border-border/50 scrollbar-hidden">
          <button
            onClick={() => setTab('main')}
            className={`relative flex flex-shrink-0 items-center gap-1.5 px-5 py-2.5 font-mono text-[11px] whitespace-nowrap transition-colors duration-200 ${
              activeTab === 'main' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Library className="h-3 w-3" />
            Main
            {activeTab === 'main' && (
              <motion.div layoutId="tab-indicator" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
            )}
          </button>

          <button
            onClick={() => setTab('daily')}
            className={`relative flex flex-shrink-0 items-center gap-1.5 px-5 py-2.5 font-mono text-[11px] whitespace-nowrap transition-colors duration-200 ${
              activeTab === 'daily' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sun className="h-3 w-3" />
            Daily
            {activeTab === 'daily' && (
              <motion.div layoutId="tab-indicator" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
            )}
          </button>

          <button
            onClick={() => setTab('mine')}
            className={`relative flex flex-shrink-0 items-center gap-1.5 px-5 py-2.5 font-mono text-[11px] whitespace-nowrap transition-colors duration-200 ${
              activeTab === 'mine' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookMarked className="h-3 w-3" />
            Mine
            {activeTab === 'mine' && (
              <motion.div layoutId="tab-indicator" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
            )}
          </button>
        </div>
      </header>

      {activeTab === 'main' && (
        <PromptListTab
          source="featured"
          emptyTitle="No featured prompts yet"
          emptyDesc="Curated prompts show up here."
        />
      )}
      {activeTab === 'daily' && (
        <PromptListTab
          source="daily_auto"
          allowDelete
          excludeArchived
          archiveHref="/resources/prompts/archive"
          emptyTitle="No daily prompts yet"
          emptyDesc="New auto-generated prompts land here once the daily job runs."
        />
      )}
      {activeTab === 'mine' && (
        <PromptListTab
          source="user"
          allowCreate
          allowEdit
          allowDelete
          emptyTitle="No prompts saved yet"
          emptyDesc="Save your best prompts here to copy them instantly."
        />
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function PromptsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <PromptsContent />
    </Suspense>
  )
}
