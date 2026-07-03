'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, Plus, RefreshCw, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { ModalShell } from './modal-shell'
import { loadWatchedUrls, addWatchedUrl, removeWatchedUrl, checkUrl, type WatchedUrl } from '@/lib/url-watcher'

function formatRelativeTime(ts: number | null): string {
  if (!ts) return 'never'
  const diffMs = Date.now() - ts
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function UrlWatcherPanel({ onClose }: { onClose: () => void }) {
  const [urls, setUrls] = useState<WatchedUrl[]>(() => loadWatchedUrls())
  const [newUrl, setNewUrl] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const refresh = () => setUrls(loadWatchedUrls())

  const handleAdd = () => {
    const url = newUrl.trim()
    if (!url) return
    try {
      new URL(url)
    } catch {
      return
    }
    addWatchedUrl(url, newLabel.trim())
    setNewUrl('')
    setNewLabel('')
    refresh()
  }

  const handleCheck = async (entry: WatchedUrl) => {
    setCheckingId(entry.id)
    await checkUrl(entry)
    refresh()
    setCheckingId(null)
  }

  return (
    <ModalShell title="URL Watcher" subtitle="Track pages for changes" icon={<Globe className="h-4 w-4 text-primary" />} onClose={onClose} width="w-[520px]">
      <div className="mb-4 space-y-2 rounded border border-border bg-surface-elevated p-3">
        <input
          type="text"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          className="w-full rounded border border-border bg-surface-base px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            className="flex-1 rounded border border-border bg-surface-base px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button
            onClick={handleAdd}
            disabled={!newUrl.trim()}
            className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Watch
          </button>
        </div>
      </div>

      {urls.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No URLs yet. Add one above to start tracking changes.
        </p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {urls.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="rounded border border-border bg-surface-elevated p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{entry.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{entry.url}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleCheck(entry)}
                      disabled={checkingId === entry.id}
                      className="rounded p-1.5 text-muted-foreground hover:bg-surface-secondary hover:text-primary disabled:opacity-50"
                      title="Check now"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${checkingId === entry.id ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => {
                        removeWatchedUrl(entry.id)
                        refresh()
                      }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-surface-secondary hover:text-destructive"
                      title="Stop watching"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs">
                  {entry.lastChangedAt && entry.lastSummary ? (
                    <>
                      <AlertCircle className="h-3 w-3 flex-shrink-0 text-warning" />
                      <span className="text-foreground">{entry.lastSummary}</span>
                    </>
                  ) : entry.lastCheckedAt ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">No changes detected</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not checked yet</span>
                  )}
                </div>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">
                  Last checked: {formatRelativeTime(entry.lastCheckedAt)}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </ModalShell>
  )
}
