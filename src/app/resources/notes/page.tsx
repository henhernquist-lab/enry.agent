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
} from 'lucide-react'
import { loadResources, saveResource, updateResource, deleteResource, resourceSummary, type Resource, type NotePayload } from '@/lib/resources'

function noteTitle(content: string): string {
  const firstLine = content.trimStart().split('\n')[0].replace(/\s+/g, ' ')
  return firstLine.length > 50 ? `${firstLine.slice(0, 50)}…` : firstLine || 'New note'
}

function noteDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function NotesPageContent() {
  const { status } = useSession()
  const router = useRouter()
  const [notes, setNotes] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isNew, setIsNew] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const load = useCallback(async () => {
    const r = await loadResources('note')
    setNotes(r)
    setLoading(false)
    return r
  }, [])

  useEffect(() => { load() }, [load])

  // Select the first note on initial load if nothing selected
  useEffect(() => {
    if (!loading && notes.length > 0 && !selectedId && !isNew) {
      setSelectedId(notes[0].id)
    }
  }, [loading, notes, selectedId, isNew])

  // Load selected note content into editor
  useEffect(() => {
    if (!selectedId) return
    const note = notes.find((n) => n.id === selectedId)
    if (note) {
      const np = note.payload as NotePayload
      setEditorContent(np.content)
      setIsNew(false)
    }
  }, [selectedId, notes])

  // Focus textarea when selecting a note
  useEffect(() => {
    if (selectedId || isNew) {
      textareaRef.current?.focus()
    }
  }, [selectedId, isNew])

  const save = useCallback(async (text: string, noteId: string | null, newNote: boolean) => {
    setSaving(true)
    try {
      const title = noteTitle(text)
      if (newNote && !noteId) {
        // Create new note
        await saveResource('note', title, { content: text })
        const updated = await load()
        const last = updated[0] // most recent, since resources are sorted desc
        if (last) setSelectedId(last.id)
        setIsNew(false)
      } else if (noteId) {
        // Update existing
        await updateResource(noteId, 'note', title, { content: text })
        await load()
      }
      setSavedAt(Date.now())
    } catch {
      // silently fail
    } finally {
      setSaving(false)
    }
  }, [load])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setEditorContent(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(text, selectedId, isNew), 800)
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

  const handleNewNote = () => {
    setSelectedId(null)
    setIsNew(true)
    setEditorContent('')
  }

  const handleSelectNote = (id: string) => {
    setSelectedId(id)
    setIsNew(false)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteResource(id)
    if (selectedId === id) {
      setSelectedId(null)
      setIsNew(false)
      setEditorContent('')
    }
    await load()
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const selectedNote = selectedId ? notes.find((n) => n.id === selectedId) : null

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
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            notebook
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
              <AnimatePresence>
                {notes.length === 0 ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="px-3 py-6 text-center font-mono text-[10px] text-muted-foreground"
                  >
                    No notes yet.
                    <br />
                    Use Quick Notes on the homepage
                    <br />
                    or click New above.
                  </motion.p>
                ) : (
                  notes.map((note) => {
                    const np = note.payload as NotePayload
                    const isActive = selectedId === note.id && !isNew
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
            {isNew || selectedNote ? (
              <div className="flex flex-1 flex-col">
                {/* Note header */}
                <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2">
                  <Pencil className="h-3 w-3 text-primary/60" />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {isNew ? 'New note' : noteTitle(editorContent || (selectedNote?.payload as NotePayload)?.content || '')}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground/40 ml-auto">
                    {isNew ? 'unsaved' : `last changed ${noteDate(selectedNote?.updated_at ?? '')}`}
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
                    className="ruled-notebook block min-h-full w-full resize-none bg-transparent px-6 py-4 font-sans text-sm leading-8 text-foreground placeholder-muted-foreground/30 focus:outline-none"
                    style={{
                      lineHeight: '2rem',
                      backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent calc(2rem - 1px), rgba(58, 158, 96, 0.05) calc(2rem - 1px), rgba(58, 158, 96, 0.05) 2rem)',
                      backgroundSize: '100% 2rem',
                      backgroundAttachment: 'local',
                      paddingTop: 'calc(0.5rem + 2px)',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center space-y-3">
                  <StickyNote className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="font-mono text-xs text-muted-foreground">
                    Select a note from the sidebar
                  </p>
                  <button
                    onClick={handleNewNote}
                    className="inline-flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New note
                  </button>
                </div>
              </div>
            )}
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
