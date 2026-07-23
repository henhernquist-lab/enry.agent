'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { StickyNote } from 'lucide-react'
import { Card } from '@/components/card'

export function QuickNotesCard() {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <Card padding="lg" className="h-full">
      <div className="mb-3 flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Quick Notes</h3>
        {saving && <span className="ml-auto text-[10px] text-muted-foreground">saving…</span>}
        {loaded && !saving && <span className="ml-auto text-[10px] text-muted-foreground/50">auto-saved</span>}
      </div>
      <textarea
        value={content}
        onChange={handleChange}
        placeholder="Jot something down…"
        rows={5}
        className="w-full resize-none rounded border border-border bg-surface-elevated px-3 py-2 font-sans text-[13px] leading-relaxed text-foreground placeholder-muted-foreground/40 focus:border-primary/30 focus:outline-none"
      />
    </Card>
  )
}
