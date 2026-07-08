'use client'

import { useState } from 'react'
import { StickyNote, Loader2, Check } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import { saveResource, type NotePayload } from '@/lib/resources'

function autoTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ')
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
}

interface QuickNotesProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

export function QuickNotes({ onClose, mode = 'modal', onSave }: QuickNotesProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      const finalTitle = title.trim() || autoTitle(content)
      const payload: NotePayload = {
        content: content.trim(),
        ...(title.trim() && { title: title.trim() }),
      }
      await saveResource('note', finalTitle, payload)
      setTitle('')
      setContent('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSave?.()
    } finally {
      setSaving(false)
    }
  }

  const icon = <StickyNote className="h-4 w-4 text-primary" />
  const inputCls = 'w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30'

  const body = (
    <div className="space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional — auto-generated if left blank)"
        className={inputCls}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave() }}
        placeholder="Write a quick note…"
        rows={6}
        className={`${inputCls} resize-y`}
      />
      <button
        onClick={handleSave}
        disabled={saving || !content.trim()}
        className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/15 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <><Check className="h-4 w-4" /> Saved!</> : 'Save Note'}
      </button>
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel title="Quick Notes" subtitle="Fast capture, no fuss" icon={icon} onClose={onClose}>
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell title="Quick Notes" subtitle="Fast capture, no fuss" icon={icon} onClose={onClose} width="w-[480px]">
      {body}
    </ModalShell>
  )
}
