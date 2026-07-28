'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { StickyNote, ChevronRight, Loader2 } from 'lucide-react'
import { saveResource, loadResources } from '@/lib/resources'

interface QuickNotesWidgetProps {
  onSave?: () => void
}

export function QuickNotesWidget({ onSave }: QuickNotesWidgetProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [committing, setCommitting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasCommitted = useRef(false)

  // Save draft to server (debounced)
  const saveDraft = useCallback(async (content: string) => {
    if (saving) return
    setSaving(true)
    try {
      await fetch('/api/notes/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    } catch {
      // silently fail
    } finally {
      setSaving(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On mount: check for existing draft, commit if found
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/notes/draft')
        const data = await res.json()
        if (data.content && data.exists && !hasCommitted.current) {
          hasCommitted.current = true
          setCommitting(true)

          // Commit draft as a new note
          await saveResource(
            'note',
            data.content.trim().replace(/\s+/g, ' ').slice(0, 40) || 'Note',
            { content: data.content }
          )
          // Clear the draft
          await fetch('/api/notes/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'commit' }),
          })
          onSave?.()
        }
      } catch {
        // silently fail
      } finally {
        setCommitting(false)
        setLoading(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setInput(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveDraft(text), 600)
  }

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

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
        <Link
          href="/resources/notes"
          className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors"
        >
          Open
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Capture scratchpad */}
      {committing ? (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="font-mono text-[10px] text-muted-foreground">saving previous note…</span>
        </div>
      ) : (
        <>
          <textarea
            value={input}
            onChange={handleChange}
            placeholder="Jot something down — it'll be here when you come back…"
            rows={3}
            className="w-full resize-none rounded border border-border bg-surface-elevated px-2.5 py-2 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            {saving && (
              <span className="font-mono text-[10px] text-muted-foreground">saving draft…</span>
            )}
            {!saving && input && (
              <span className="font-mono text-[10px] text-primary/60">draft saved</span>
            )}
            <span className="font-mono text-[9px] text-muted-foreground/40">
              autosaves as you type
            </span>
          </div>
        </>
      )}
    </div>
  )
}
