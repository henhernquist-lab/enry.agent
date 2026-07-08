'use client'

import { useState } from 'react'
import { FileText, ImageIcon, FileCode, ChevronDown, ChevronUp, BookmarkPlus, Check, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/uploads'
import type { AttachmentMeta } from '@/lib/attachment-marker'
import type { UploadedFilePayload } from '@/lib/resources'

function typeIcon(fileType: AttachmentMeta['file_type']) {
  if (fileType === 'image') return ImageIcon
  if (fileType === 'pdf') return FileText
  return FileCode
}

export function FileAttachmentCard({ attachment }: { attachment: AttachmentMeta }) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const Icon = typeIcon(attachment.file_type)

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: UploadedFilePayload = {
        filename: attachment.filename,
        file_type: attachment.file_type,
        storage_path: attachment.storage_path,
        extracted_summary: attachment.extracted_summary,
        uploaded_at: new Date().toISOString(),
      }
      await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'uploaded_file', title: attachment.filename, payload }),
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-2 rounded border border-border bg-surface-elevated/60 text-xs">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{attachment.filename}</p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {attachment.file_type} · {formatBytes(attachment.size)}{attachment.truncated ? ' · truncated' : ''}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border/60 px-2.5 py-2">
          <p className="whitespace-pre-wrap text-muted-foreground">{attachment.extracted_summary}</p>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="flex items-center gap-1.5 rounded border border-border bg-surface-base px-2 py-1 font-mono text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3 text-primary" /> : <BookmarkPlus className="h-3 w-3" />}
            {saved ? 'Saved' : 'Save to Resources'}
          </button>
        </div>
      )}
    </div>
  )
}
