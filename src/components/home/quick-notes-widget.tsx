'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { StickyNote, ChevronRight, Plus, Loader2 } from 'lucide-react'
import { saveResource, loadResources } from '@/lib/resources'

function noteTitle(content: string): string {
  const firstLine = content.trimStart().split('\n')[0].replace(/\s+/g, ' ')
  return firstLine.length > 50 ? `${firstLine.slice(0, 50)}…` : firstLine || 'Quick note'
}

interface QuickNotesWidgetProps {
  onSave?: () => void
}

export function QuickNotesWidget({ onSave }: QuickNotesWidgetProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [committing, setCommitting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load existing draft on mount — persistent surface, never auto-clears
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/notes/draft')
        const data = await res.json()
        if (data.exists) setContent(data.content)
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Save draft (debounced autosave)
  const saveDraft = useCallback(async (text: string) => {
    setSaving(true)
    try {
      await fetch('/api/notes/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
    } catch {
      // silently fail
    } finally {
      setSaving(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setContent(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveDraft(text), 600)
  }

  // New Note: commit current draft as a saved note, then clear surface
  const handleNewNote = async () => {
    if (!content.trim()) return
    setCommitting(true)
    try {
      const title = noteTitle(content)
      await saveResource('note', title, { content: content.trim() })
      // Clear the draft
      await fetch('/api/notes/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit' }),
      })
      setContent('')
      onSave?.()
      // Refresh notes list in case grimoire is open
      window.dispatchEvent(new CustomEvent('grimoire:note-saved'))
    } catch {
      // silently fail
    } finally {
      setCommitting(false)
    }
  }

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Listen for external draft changes (from floating panel)
  useEffect(() => {
    const handler = () => {
      fetch('/api/notes/draft')
        .then((r) => r.json())
        .then((d) => setContent(d.content ?? ''))
        .catch(() => {})
    }
    window.addEventListener('grimoire:draft-changed', handler)
    return () => window.removeEventListener('grimoire:draft-changed', handler)
  }, [])

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="h-3.5 w-3.5 text-primary" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            The Grimoire
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {content.trim() && (
            <button
              onClick={handleNewNote}
              disabled={committing}
              className="flex items-center gap-1 rounded border border-primary/30 px-2 py-0.5 font-mono text-[10px] text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
            >
              {committing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              New Note
            </button>
          )}
          <Link
            href="/grimoire"
            className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors"
          >
            Open
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Capture scratchpad */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <textarea
            value={content}
            onChange={handleChange}
            placeholder="Jot something down — it'll stay here until you press New Note…"
            rows={3}
            className="w-full resize-none rounded border border-border bg-surface-elevated px-2.5 py-2 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            {saving && (
              <span className="font-mono text-[10px] text-muted-foreground">saving draft…</span>
            )}
            {!saving && content && (
              <span className="font-mono text-[10px] text-primary/60">draft saved</span>
            )}
            <span className="font-mono text-[9px] text-muted-foreground/40">
              persists across reloads
            </span>
          </div>
        </>
      )}
    </div>
  )
}
