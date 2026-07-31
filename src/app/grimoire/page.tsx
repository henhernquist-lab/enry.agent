'use client'

import { Suspense, useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Loader2,
  StickyNote,
  Check,
  Plus,
  Trash2,
  Pencil,
  Edit3,
} from 'lucide-react'
import { loadResources, saveResource, updateResource, deleteResource, resourceSummary, type Resource, type NotePayload } from '@/lib/resources'
import { GolemInline } from '@/components/golem/golem-inline'

function noteTitle(content: string): string {
  const firstLine = content.trimStart().split('\n')[0].replace(/\s+/g, ' ')
  return firstLine.length > 50 ? `${firstLine.slice(0, 50)}…` : firstLine || 'New note'
}

function noteDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

type EditorTarget = { type: 'draft' } | { type: 'saved'; id: string }

function NotesPageContent() {
  const { status } = useSession()
  const router = useRouter()
  const [notes, setNotes] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState<EditorTarget>({ type: 'draft' })
  const [editorContent, setEditorContent] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const loadNotes = useCallback(async () => {
    const r = await loadResources('note')
    setNotes(r)
    return r
  }, [])

  const loadDraft = useCallback(async () => {
    try {
      const res = await fetch('/api/notes/draft')
      const data = await res.json()
      const c = data.exists ? data.content : ''
      setDraftContent(c)
      return c
    } catch {
      return ''
    }
  }, [])

  // Initial load
  useEffect(() => {
    (async () => {
      await Promise.all([loadNotes(), loadDraft()])
      setLoading(false)
    })()
  }, [loadNotes, loadDraft])

  // Load editor content based on target
  useEffect(() => {
    if (target.type === 'draft') {
      setEditorContent(draftContent)
    } else {
      const note = notes.find((n) => n.id === target.id)
      if (note) {
        const np = note.payload as NotePayload
        setEditorContent(np.content)
      }
    }
  }, [target, draftContent, notes])

  // Focus textarea when target changes
  useEffect(() => {
    if (!loading) {
      textareaRef.current?.focus()
    }
  }, [target, loading])

  const saveDraft = useCallback(async (text: string) => {
    setSaving(true)
    try {
      await fetch('/api/notes/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      setDraftContent(text)
      window.dispatchEvent(new CustomEvent('grimoire:draft-changed'))
      setSavedAt(Date.now())
    } catch {
      // silently fail
    } finally {
      setSaving(false)
    }
  }, [])

  const saveNote = useCallback(async (text: string, noteId: string) => {
    setSaving(true)
    try {
      const title = noteTitle(text)
      await updateResource(noteId, 'note', title, { content: text })
      await loadNotes()
      setSavedAt(Date.now())
    } catch {
      // silently fail
    } finally {
      setSaving(false)
    }
  }, [loadNotes])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setEditorContent(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (target.type === 'draft') {
        saveDraft(text)
      } else {
        saveNote(text, target.id)
      }
    }, 800)
  }

  // Flash saved indicator
  useEffect(() => {
    if (savedAt === null) return
    const t = setTimeout(() => setSavedAt(null), 2000)
    return () => clearTimeout(t)
  }, [savedAt])

  // Cleanup debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // New Note: commit current draft as saved note, clear draft, start fresh
  const handleNewNote = async () => {
    if (target.type === 'draft' && draftContent.trim()) {
      setSaving(true)
      try {
        const title = noteTitle(draftContent)
        await saveResource('note', title, { content: draftContent.trim() })
        await fetch('/api/notes/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'commit' }),
        })
        setDraftContent('')
        setEditorContent('')
        setTarget({ type: 'draft' })
        await loadNotes()
        window.dispatchEvent(new CustomEvent('grimoire:note-saved'))
        window.dispatchEvent(new CustomEvent('grimoire:draft-changed'))
      } catch {
        // silently fail
      } finally {
        setSaving(false)
      }
    } else {
      // Already on a blank draft — just ensure it's the target
      setTarget({ type: 'draft' })
      setEditorContent('')
    }
  }

  const handleSelectDraft = () => {
    setTarget({ type: 'draft' })
    setEditorContent(draftContent)
  }

  const handleSelectNote = (id: string) => {
    setTarget({ type: 'saved', id })
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteResource(id)
    if (target.type === 'saved' && target.id === id) {
      setTarget({ type: 'draft' })
      setEditorContent(draftContent)
    }
    await loadNotes()
  }

  // Listen for external note-saved events (from widget/floating panel)
  useEffect(() => {
    const handler = () => loadNotes()
    window.addEventListener('grimoire:note-saved', handler)
    return () => window.removeEventListener('grimoire:note-saved', handler)
  }, [loadNotes])

  // Listen for external draft changes
  useEffect(() => {
    const handler = async () => {
      try {
        const res = await fetch('/api/notes/draft')
        const data = await res.json()
        const c = data.exists ? data.content : ''
        setDraftContent(c)
        if (target.type === 'draft') {
          setEditorContent(c)
        }
      } catch {}
    }
    window.addEventListener('grimoire:draft-changed', handler)
    return () => window.removeEventListener('grimoire:draft-changed', handler)
  }, [target])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isDraftActive = target.type === 'draft'
  const selectedNote = target.type === 'saved' ? notes.find((n) => n.id === target.id) : null
  const draftHasContent = draftContent.trim().length > 0

  return (
    <div className="flex h-screen flex-col bg-surface-base">
      {/* Header */}
      <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
          <span className="font-display text-xs tracking-wide text-muted-foreground">
            The Grimoire
          </span>
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

      {/* Body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar — note index */}
          <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface-secondary/60">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {notes.length} note{notes.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={handleNewNote}
                className="flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] text-primary hover:bg-primary/10 transition-colors"
              >
                <Plus className="h-3 w-3" />
                New
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Current Note (draft) — always at top */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={handleSelectDraft}
                className={`group flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors ${
                  isDraftActive
                    ? 'bg-primary/10 border-l-2 border-l-primary'
                    : 'border-l-2 border-l-transparent hover:bg-surface-elevated/60'
                }`}
              >
                <Edit3 className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {draftHasContent ? noteTitle(draftContent) : 'Current Note'}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                    {draftHasContent ? 'draft' : 'start writing…'}
                  </p>
                </div>
              </motion.button>

              {/* Divider */}
              <div className="mx-3 my-1 border-t border-border/40" />

              {/* Saved notes */}
              <AnimatePresence>
                {notes.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center px-3 py-6"
                  >
                    <GolemInline size={64} slow />
                    <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground">
                      No saved notes yet.
                      <br />
                      Press &ldquo;New Note&rdquo; to save
                      <br />
                      your current draft.
                    </p>
                  </motion.div>
                ) : (
                  notes.map((note) => {
                    const np = note.payload as NotePayload
                    const isActive = target.type === 'saved' && target.id === note.id
                    return (
                      <motion.button
                        key={note.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => handleSelectNote(note.id)}
                        className={`group flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors ${
                          isActive
                            ? 'bg-primary/10 border-l-2 border-l-primary'
                            : 'border-l-2 border-l-transparent hover:bg-surface-elevated/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {noteTitle(np.content)}
                          </p>
                          <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                            {noteDate(note.updated_at)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDelete(note.id, e)}
                          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </motion.button>
                    )
                  })
                )}
              </AnimatePresence>
            </div>
          </aside>

          {/* Main editor area */}
          <main className="flex flex-1 flex-col overflow-hidden">
            {/* Note header */}
            <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2">
              <Pencil className="h-3 w-3 text-primary/60" />
              <span className="font-mono text-[10px] text-muted-foreground">
                {isDraftActive
                  ? draftHasContent
                    ? `Current Note — ${noteTitle(draftContent)}`
                    : 'Current Note'
                  : noteTitle(editorContent || (selectedNote?.payload as NotePayload)?.content || '')}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground/40 ml-auto">
                {isDraftActive
                  ? draftHasContent ? 'draft' : 'blank'
                  : `saved ${noteDate(selectedNote?.updated_at ?? '')}`}
              </span>
            </div>

            {/* Ruled paper editor */}
            <div className="flex-1 overflow-y-auto">
              <textarea
                ref={textareaRef}
                value={editorContent}
                onChange={handleChange}
                placeholder="Start writing…"
                spellCheck
                className="ruled-notebook block min-h-full w-full resize-none bg-transparent px-6 py-4 font-sans text-sm text-foreground placeholder-muted-foreground/30 focus:outline-none"
                style={{
                  lineHeight: '2rem',
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent calc(2rem - 1px), rgba(184, 147, 90, 0.06) calc(2rem - 1px), rgba(184, 147, 90, 0.06) 2rem)',
                  backgroundSize: '100% 2rem',
                  backgroundAttachment: 'local',
                  paddingTop: 'calc(0.5rem + 2px)',
                }}
              />
            </div>
          </main>
        </div>
      )}
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
