'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pin, PinOff, ShieldCheck, ShieldAlert, MessageSquare, GitCommit, FileText, PenLine, Sparkles, ExternalLink, BookOpen, Check, type LucideIcon } from 'lucide-react'
import type { SourcesView, ImportSource } from '@/lib/learn/sources'

type SourceFilter = 'all' | 'claims' | 'imports' | 'queued'

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
  const [filter, setFilter] = useState<SourceFilter>('all')

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

  const togglePin = async (key: string, pinned: boolean, source_type: string, source_ref: string | null) => {
    setBusyKey(key)
    try {
      await fetch('/api/learn/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: pinned ? 'unpin' : 'pin', source_type, source_ref }),
      })
      await load()
    } catch { /* keep prior view */ } finally {
      setBusyKey(null)
    }
  }

  const toggleRead = async (imp: ImportSource) => {
    setBusyKey(imp.key)
    try {
      await fetch('/api/learn/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: imp.unread ? 'mark_read' : 'mark_unread', resource_id: imp.resource_id }),
      })
      await load()
    } catch { /* keep prior view */ } finally {
      setBusyKey(null)
    }
  }

  const imports = useMemo(() => {
    if (!view) return []
    return filter === 'queued' ? view.imports.filter((i) => i.unread) : view.imports
  }, [view, filter])

  if (loading && !view) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }
  if (error) {
    return <div className="flex flex-1 items-center justify-center"><p className="font-mono text-[12px] text-destructive">{error}</p></div>
  }
  if (!view || (view.sources.length === 0 && view.imports.length === 0)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-xs text-center">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/50">No sources yet</p>
          <p className="mt-2 font-sans text-[12px] leading-relaxed text-muted-foreground/40">Every claim you capture carries where it came from. Learn something and its source shows up here.</p>
        </div>
      </div>
    )
  }

  const showClaims = filter === 'all' || filter === 'claims'
  const showImports = filter === 'all' || filter === 'imports' || filter === 'queued'
  const FILTERS: { id: SourceFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: view.sources.length + view.imports.length },
    { id: 'claims', label: 'Claim sources', count: view.sources.length },
    { id: 'imports', label: 'Imports', count: view.totals.imports_total },
    { id: 'queued', label: 'Queued', count: view.totals.imports_unread },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Custody summary */}
      <div className="flex flex-shrink-0 items-center gap-4 border-b border-border px-6 py-3 font-mono text-[10px] uppercase tracking-wider">
        <span className="flex items-center gap-1.5 text-primary"><ShieldCheck className="h-3.5 w-3.5" /> {view.totals.pinned_sources} pinned</span>
        <span className="flex items-center gap-1.5 text-muted-foreground/60">{view.totals.unpinned_sources} unpinned</span>
        {view.totals.imports_unread > 0 && (
          <span className="flex items-center gap-1.5 text-accent"><BookOpen className="h-3.5 w-3.5" /> {view.totals.imports_unread} queued</span>
        )}
        {view.totals.claims_without_pinned_custody > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-warning" title="Mechanism only — not enforced until Source-Grounded Mode">
            <ShieldAlert className="h-3.5 w-3.5" /> {view.totals.claims_without_pinned_custody} claims lack pinned custody
          </span>
        )}
      </div>

      {/* Filter bar — claim sources vs. folded imports (Article Notes / Reading List) */}
      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-border px-6 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              filter === f.id ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label} <span className="text-muted-foreground/50">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        <div className="mx-auto max-w-[760px] px-6 py-5 space-y-3">
          {showClaims && view.sources.map((g) => {
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
                    onClick={() => togglePin(g.key, g.pinned, g.source_type, g.source_ref)}
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

          {/* Folded imports — Article Notes / Reading List */}
          {showImports && imports.map((imp) => {
            const busy = busyKey === imp.key
            return (
              <div key={imp.key} className={`rounded border ${imp.pinned ? 'border-primary/40 bg-primary/[0.04]' : 'border-border bg-surface-secondary'} p-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className={`h-3.5 w-3.5 ${imp.pinned ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-mono text-[11px] uppercase tracking-wider text-foreground">Imported document</span>
                      {imp.unread ? (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">Queued</span>
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground/50">{imp.derived_claim_count > 0 ? `${imp.derived_claim_count} claim${imp.derived_claim_count === 1 ? '' : 's'}` : 'read'}</span>
                      )}
                    </div>
                    <p className="mt-1 truncate font-sans text-[12px] text-foreground">{imp.title}</p>
                    <div className="mt-0.5"><OriginRef sourceRef={imp.source_ref || null} /></div>
                    {imp.summary && <p className="mt-1 line-clamp-2 font-sans text-[11px] leading-relaxed text-muted-foreground/70">{imp.summary}</p>}
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-stretch gap-1.5">
                    <button
                      onClick={() => togglePin(imp.key, imp.pinned, 'import', imp.source_ref || null)}
                      disabled={busy}
                      className={`flex items-center justify-center gap-1 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-40 ${
                        imp.pinned ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20' : 'border-border text-muted-foreground hover:border-primary/30 hover:text-primary'
                      }`}
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : imp.pinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
                      {imp.pinned ? 'Pinned' : 'Pin'}
                    </button>
                    <button
                      onClick={() => toggleRead(imp)}
                      disabled={busy}
                      className="flex items-center justify-center gap-1 rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      {imp.unread ? <><Check className="h-3 w-3" /> Read</> : 'Unread'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
