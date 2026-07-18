'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pin, PinOff, ShieldCheck, ShieldAlert, MessageSquare, GitCommit, FileText, PenLine, Sparkles, ExternalLink, type LucideIcon } from 'lucide-react'
import type { SourcesView, SourceGroup } from '@/lib/learn/sources'

// Sources tab — Source Custody. Browse every claim by where it came from,
// grouped by source; pin a source as trusted. Pinning is a mechanism only:
// pinned sources are what a future Source-Grounded Mode will preferentially
// cite, and unpinned custody is surfaced (not enforced) here.

const TYPE_META: Record<string, { label: string; icon: LucideIcon }> = {
  chat: { label: 'Chat', icon: MessageSquare },
  commit: { label: 'Commit', icon: GitCommit },
  import: { label: 'Imported document', icon: FileText },
  manual: { label: 'Manual entry', icon: PenLine },
  derived: { label: 'Derived', icon: Sparkles },
}

function typeMeta(t: string) {
  return TYPE_META[t] ?? { label: t, icon: FileText }
}

function OriginRef({ sourceRef }: { sourceRef: string | null }) {
  if (!sourceRef) return <span className="font-mono text-[10px] text-muted-foreground/40">no origin ref</span>
  const isUrl = /^https?:\/\//.test(sourceRef)
  if (isUrl) {
    return (
      <a href={sourceRef} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[10px] text-accent hover:underline">
        {sourceRef.length > 48 ? sourceRef.slice(0, 48) + '…' : sourceRef} <ExternalLink className="h-2.5 w-2.5" />
      </a>
    )
  }
  return <span className="font-mono text-[10px] text-muted-foreground/60">{sourceRef}</span>
}

export function SourcesPanel() {
  const [view, setView] = useState<SourcesView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/learn/sources')
      if (!res.ok) { setError(`Failed to load sources (HTTP ${res.status})`); return }
      setView(await res.json())
    } catch {
      setError('Network error loading sources')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load — inline async IIFE (not a bare load() call) so the effect
  // body doesn't setState synchronously.
  useEffect(() => {
    let cancelled = false
    ;(async () => { if (!cancelled) await load() })()
    return () => { cancelled = true }
  }, [load])

  const togglePin = async (g: SourceGroup) => {
    setBusyKey(g.key)
    try {
      await fetch('/api/learn/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: g.pinned ? 'unpin' : 'pin', source_type: g.source_type, source_ref: g.source_ref }),
      })
      await load()
    } catch { /* keep prior view */ } finally {
      setBusyKey(null)
    }
  }

  if (loading && !view) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }
  if (error) {
    return <div className="flex flex-1 items-center justify-center"><p className="font-mono text-[12px] text-destructive">{error}</p></div>
  }
  if (!view || view.sources.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-xs text-center">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/50">No sources yet</p>
          <p className="mt-2 font-sans text-[12px] leading-relaxed text-muted-foreground/40">Every claim you capture carries where it came from. Learn something and its source shows up here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Custody summary */}
      <div className="flex flex-shrink-0 items-center gap-4 border-b border-border px-6 py-3 font-mono text-[10px] uppercase tracking-wider">
        <span className="flex items-center gap-1.5 text-primary"><ShieldCheck className="h-3.5 w-3.5" /> {view.totals.pinned_sources} pinned</span>
        <span className="flex items-center gap-1.5 text-muted-foreground/60">{view.totals.unpinned_sources} unpinned</span>
        {view.totals.claims_without_pinned_custody > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-warning" title="Mechanism only — not enforced until Source-Grounded Mode">
            <ShieldAlert className="h-3.5 w-3.5" /> {view.totals.claims_without_pinned_custody} claims lack pinned custody
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        <div className="mx-auto max-w-[760px] px-6 py-5 space-y-3">
          {view.sources.map((g) => {
            const meta = typeMeta(g.source_type)
            const Icon = meta.icon
            const busy = busyKey === g.key
            return (
              <div key={g.key} className={`rounded border ${g.pinned ? 'border-primary/40 bg-primary/[0.04]' : 'border-border bg-surface-secondary'} p-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 ${g.pinned ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-mono text-[11px] uppercase tracking-wider text-foreground">{meta.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/50">{g.claim_count} claim{g.claim_count === 1 ? '' : 's'}</span>
                    </div>
                    <div className="mt-1"><OriginRef sourceRef={g.source_ref} /></div>
                  </div>
                  <button
                    onClick={() => togglePin(g)}
                    disabled={busy}
                    className={`flex flex-shrink-0 items-center gap-1 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-40 ${
                      g.pinned ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20' : 'border-border text-muted-foreground hover:border-primary/30 hover:text-primary'
                    }`}
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : g.pinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
                    {g.pinned ? 'Pinned' : 'Pin'}
                  </button>
                </div>
                <ul className="mt-2 space-y-1 border-t border-border/50 pt-2">
                  {g.sample_claims.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 font-sans text-[11px] leading-relaxed text-muted-foreground">
                      <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground/40" />
                      <span className="min-w-0">{c.content}</span>
                    </li>
                  ))}
                  {g.claim_count > g.sample_claims.length && (
                    <li className="font-mono text-[10px] text-muted-foreground/40">+{g.claim_count - g.sample_claims.length} more</li>
                  )}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
