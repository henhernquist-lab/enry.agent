'use client'

import { FileText, ImageIcon, FileCode, X, Loader2, AlertCircle } from 'lucide-react'
import { formatBytes, type UploadFileType } from '@/lib/uploads'

export interface PendingUpload {
  file: File
  status: 'uploading' | 'ready' | 'error'
  error?: string
  fileType?: UploadFileType
}

function typeIcon(fileType?: UploadFileType) {
  if (fileType === 'image') return ImageIcon
  if (fileType === 'pdf') return FileText
  return FileCode
}

export function FileAttachmentChip({ upload, onRemove }: { upload: PendingUpload; onRemove: () => void }) {
  const Icon = typeIcon(upload.fileType)

  return (
    <div className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-xs ${
      upload.status === 'error' ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-surface-elevated'
    }`}>
      {upload.status === 'uploading' ? (
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-muted-foreground" />
      ) : upload.status === 'error' ? (
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-destructive" />
      ) : (
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
      )}
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{upload.file.name}</p>
        <p className="font-mono text-[10px] text-muted-foreground">
          {upload.status === 'error' ? upload.error : `${formatBytes(upload.file.size)}${upload.status === 'uploading' ? ' · uploading…' : ''}`}
        </p>
      </div>
      <button onClick={onRemove} className="ml-1 flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
