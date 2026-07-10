'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { StickyNote, Loader2, Plus, ChevronRight, X } from 'lucide-react'
import { saveResource, loadResources, deleteResource, type Resource, type NotePayload } from '@/lib/resources'

function autoTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ')
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
}

interface QuickNotesWidgetProps {
  onSave?: () => void
}

export function QuickNotesWidget({ onSave }: QuickNotesWidgetProps) {
  const [notes, setNotes] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = () =>
    loadResources('note')
      .then((r) => {
        setNotes(r.slice(0, 5))
        setLoading(false)
      })
      .catch(() => setLoading(false))

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    const text = input.trim()
    if (!text) return
    setSaving(true)
    try {
      await saveResource('note', autoTitle(text), { content: text } satisfies NotePayload)
      setInput('')
      onSave?.()
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteResource(id)
    if (expandedId === id) setExpandedId(null)
    await load()
  }

  const hasNotes = notes.length > 0

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="h-3.5 w-3.5 text-primary" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quick Notes
          </h3>
        </div>
        {hasNotes && (
          <Link
            href="/resources/notes"
            className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors"
          >
            see all
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Input */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave() }}
        placeholder="Jot something down…"
        rows={2}
        className="w-full resize-none rounded border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none"
      />
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !input.trim()}
          className="flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </button>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </div>
      ) : hasNotes ? (
        <div className="space-y-1.5">
          {notes.map((note) => {
            const np = note.payload as NotePayload
            const isExpanded = expandedId === note.id
            return (
              <div
                key={note.id}
                onClick={() => setExpandedId(isExpanded ? null : note.id)}
                className="group cursor-pointer rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5 transition-colors hover:border-border hover:bg-surface-elevated"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-xs text-foreground flex-1 ${isExpanded ? 'whitespace-pre-wrap leading-relaxed' : 'truncate'}`}>
                    {isExpanded ? np.content : np.content.slice(0, 80)}
                    {!isExpanded && np.content.length > 80 && <span className="text-muted-foreground">…</span>}
                  </p>
                  <button
                    onClick={(e) => handleDelete(note.id, e)}
                    className="flex-shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                  {new Date(note.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  {note.title && note.title !== autoTitle(np.content) ? ` · ${note.title}` : ''}
                </p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="py-2 text-center text-[10px] text-muted-foreground">
          No notes yet. Type one above.
        </p>
      )}
    </div>
  )
}
