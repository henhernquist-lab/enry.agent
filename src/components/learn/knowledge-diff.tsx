'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Search, GraduationCap, Save, FolderOpen, Check, CircleDashed, CircleSlash } from 'lucide-react'
import { useLearnActions } from './learn-actions'

// Knowledge Diff — the flagship. Type a target topic; see its essential facets
// diffed against your claim history as a VISUAL gap (a coverage bar + a grid of
// status cells), not prose. "Study this" on a missing/weak facet hands a scoped
// `learn` invocation to the Chat tab. Saveable/reopenable via the item-4
// mechanism, so a diff from last week reopens exactly as it was.

type FacetStatus = 'known' | 'half_known' | 'missing'
interface DiffFacet {
  facet: string
  why: string
  status: FacetStatus
  matched_claim: { id: string; content: string; strength: number; similarity: number } | null
}
interface KnowledgeDiffData {
  target: string
  facets: DiffFacet[]
  coverage: { known: number; half_known: number; missing: number; total: number; pct: number }
  computed_at: string
  error?: string
}

const STATUS_META: Record<FacetStatus, { label: string; color: string; bg: string; border: string; icon: typeof Check }> = {
  known: { label: 'Known', color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40', icon: Check },
  half_known: { label: 'Half-known', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/40', icon: CircleDashed },
  missing: { label: 'Missing', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/40', icon: CircleSlash },
}

export function KnowledgeDiff() {
  const { openChatWith } = useLearnActions()
  const [target, setTarget] = useState('')
  const [data, setData] = useState<KnowledgeDiffData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMenuOpen, setSavedMenuOpen] = useState(false)
  const [savedDiffs, setSavedDiffs] = useState<{ id: string; store: string; title: string }[]>([])
  const savedMenuRef = useRef<HTMLDivElement>(null)

  const run = useCallback(async (t: string) => {
    const topic = t.trim()
    if (!topic) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/learn/diff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: topic }),
      })
      const json: KnowledgeDiffData = await res.json()
      if (!res.ok || json.error) { setError(json.error || `Failed (HTTP ${res.status})`); setData(null); return }
      setData(json)
    } catch {
      setError('Network error computing the diff')
    } finally {
      setLoading(false)
    }
  }, [])

  const saveCurrent = useCallback(async () => {
    if (!data) return
    setSaving(true)
    try {
      // Snapshot the whole computed diff so reopening is exact, not recomputed.
      await fetch('/api/learn/saved-views', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view: 'diff', title: `Diff · ${data.target} · ${new Date(data.computed_at).toLocaleDateString()}`, params: { target: data.target }, snapshot: data }),
      })
    } catch { /* ignore */ } finally { setSaving(false) }
  }, [data])

  const loadSavedList = useCallback(async () => {
    try {
      const res = await fetch('/api/learn/saved-views')
      if (!res.ok) return
      const { saved } = await res.json()
      setSavedDiffs((saved ?? []).filter((r: { view: string }) => r.view === 'diff'))
    } catch { /* ignore */ }
  }, [])

  const reopenSaved = useCallback(async (id: string, store: string) => {
    setSavedMenuOpen(false)
    try {
      const res = await fetch(`/api/learn/saved-views?id=${encodeURIComponent(id)}&store=${encodeURIComponent(store)}`)
      if (!res.ok) return
      const rec = await res.json()
      // Reconstruct from the frozen snapshot — not a live recompute.
      setData(rec.snapshot as KnowledgeDiffData)
      setTarget((rec.snapshot as KnowledgeDiffData)?.target ?? '')
      setError(null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!savedMenuOpen) return
    const onDown = (e: MouseEvent) => { if (savedMenuRef.current && !savedMenuRef.current.contains(e.target as Node)) setSavedMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [savedMenuOpen])

  const studyGap = (facet: DiffFacet) => {
    openChatWith(`learn "${data?.target}: ${facet.facet}"`)
  }

  const gaps = data?.facets.filter((f) => f.status !== 'known') ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Target input */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-6 py-3">
        <div className="flex flex-1 items-center gap-2 rounded border border-border bg-surface-secondary px-3">
          <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(target) }}
            placeholder="Diff a topic against what you know — e.g. photosynthesis, React reconciliation…"
            className="flex-1 bg-transparent py-2 font-mono text-[12px] text-foreground placeholder-muted-foreground/40 focus:outline-none"
          />
          <button onClick={() => run(target)} disabled={loading || !target.trim()} className="rounded border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-primary transition-colors hover:bg-primary/20 disabled:opacity-40">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Diff'}
          </button>
        </div>
        {data && (
          <>
            <button onClick={saveCurrent} disabled={saving} className="flex items-center gap-1.5 rounded border border-border bg-surface-secondary px-2.5 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
            </button>
          </>
        )}
        <div ref={savedMenuRef} className="relative">
          <button onClick={() => { const n = !savedMenuOpen; setSavedMenuOpen(n); if (n) loadSavedList() }} className="flex items-center gap-1 rounded border border-border bg-surface-secondary px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
            <FolderOpen className="h-3 w-3" /> Saved
          </button>
          {savedMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded border border-border bg-surface-elevated shadow-lg">
              {savedDiffs.length === 0 ? <div className="px-3 py-2 font-mono text-[10px] text-muted-foreground/50">No saved diffs yet.</div>
                : savedDiffs.map((s) => (
                  <button key={s.id} onClick={() => reopenSaved(s.id, s.store)} className="block w-full truncate px-3 py-2 text-left font-mono text-[10px] text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground">{s.title}</button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        {loading && !data && (
          <div className="flex h-full items-center justify-center"><div className="flex flex-col items-center gap-2"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /><span className="font-mono text-[11px] text-muted-foreground/50">mapping the topic…</span></div></div>
        )}
        {error && !loading && <div className="flex h-full items-center justify-center"><p className="max-w-md text-center font-mono text-[12px] text-destructive">{error}</p></div>}
        {!data && !loading && !error && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <GraduationCap className="mx-auto h-7 w-7 text-muted-foreground/30" />
              <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground/50">Knowledge Diff</p>
              <p className="mt-2 font-sans text-[12px] leading-relaxed text-muted-foreground/40">Name a topic. See its essential facets diffed against what your claims actually cover — what&apos;s solid, what&apos;s shaky, what&apos;s missing.</p>
            </div>
          </div>
        )}

        {data && (
          <div className="mx-auto max-w-[820px] px-6 py-5">
            {/* Coverage bar */}
            <div className="mb-5">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-mono text-[13px] text-foreground">{data.target}</h2>
                <span className="font-mono text-[11px] text-muted-foreground">{data.coverage.pct}% coverage</span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full border border-border bg-surface-secondary">
                <div className="bg-primary/70" style={{ width: `${(data.coverage.known / data.coverage.total) * 100}%` }} />
                <div className="bg-warning/70" style={{ width: `${(data.coverage.half_known / data.coverage.total) * 100}%` }} />
                <div className="bg-destructive/40" style={{ width: `${(data.coverage.missing / data.coverage.total) * 100}%` }} />
              </div>
              <div className="mt-2 flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider">
                <span className="text-primary">{data.coverage.known} known</span>
                <span className="text-warning">{data.coverage.half_known} half-known</span>
                <span className="text-destructive/80">{data.coverage.missing} missing</span>
                {gaps.length > 0 && (
                  <button onClick={() => studyGap(gaps[0])} className="ml-auto flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary transition-colors hover:bg-primary/20">
                    <GraduationCap className="h-3 w-3" /> Study biggest gap
                  </button>
                )}
              </div>
            </div>

            {/* Facet grid — the visual gap */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {data.facets.map((f, i) => {
                const m = STATUS_META[f.status]
                const Icon = m.icon
                return (
                  <div key={i} className={`group relative flex flex-col rounded border ${m.border} ${m.bg} p-2.5`}>
                    <div className="flex items-start gap-1.5">
                      <Icon className={`mt-0.5 h-3 w-3 flex-shrink-0 ${m.color}`} />
                      <span className="font-mono text-[11px] leading-tight text-foreground">{f.facet}</span>
                    </div>
                    {f.why && <span className="mt-1 pl-[18px] font-sans text-[10px] leading-snug text-muted-foreground/70">{f.why}</span>}
                    {f.status !== 'known' && (
                      <button onClick={() => studyGap(f)} className={`mt-2 self-start rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${m.color} opacity-0 transition-opacity hover:underline group-hover:opacity-100`}>
                        Study this →
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
