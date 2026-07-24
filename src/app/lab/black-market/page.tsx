'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Skull, Search, Loader2, AlertTriangle } from 'lucide-react'
import { CATEGORY_META, type BlackMarketEntry, type BlackMarketCategory } from '@/lib/lab/black-market'
import { BlackMarketCard } from '@/components/lab/black-market-card'
import { BlackMarketPanel } from '@/components/lab/black-market-panel'

// Filter chips combine sort modes and category/capability filters. Picking
// any one (or typing a search) switches from the 5-section browse view to a
// single flat, filtered+sorted grid.
type FilterId =
  | 'trending' | 'most-downloaded' | 'newest' | 'highest-rated'
  | 'reasoning' | 'coding' | 'vision' | 'experimental'

const FILTERS: { id: FilterId; label: string; kind: 'sort' | 'facet' }[] = [
  { id: 'trending', label: 'Trending', kind: 'sort' },
  { id: 'most-downloaded', label: 'Most Downloaded', kind: 'sort' },
  { id: 'newest', label: 'Newest', kind: 'sort' },
  { id: 'highest-rated', label: 'Highest Rated', kind: 'sort' },
  { id: 'reasoning', label: 'Reasoning', kind: 'facet' },
  { id: 'coding', label: 'Coding', kind: 'facet' },
  { id: 'vision', label: 'Vision', kind: 'facet' },
  { id: 'experimental', label: 'Experimental', kind: 'facet' },
]

const SECTION_ORDER: BlackMarketCategory[] = ['trending', 'reasoning', 'coding', 'experimental', 'verified']

export default function BlackMarketPage() {
  const [entries, setEntries] = useState<BlackMarketEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterId | null>(null)

  const [selected, setSelected] = useState<BlackMarketEntry | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/lab/black-market')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setEntries(d.entries ?? []))
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const handleAddToIdeas = useCallback(async (entry: BlackMarketEntry) => {
    setAddingId(entry.hfId)
    try {
      const repoSlug = entry.hfId.split('/').pop()!.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 50)
      const res = await fetch('/api/lab/overnight/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Evaluate ${entry.name}`,
          description: `Black Market community model (${entry.hfId}). ${entry.description}`,
          scratch_repo_owner: 'enry-lab-experiments',
          scratch_repo_name: `eval-${repoSlug}`,
        }),
      })
      if (res.ok) setAddedIds((prev) => new Set(prev).add(entry.hfId))
    } catch {
      /* non-fatal — surfaced by the button not flipping to "Added" */
    } finally {
      setAddingId(null)
    }
  }, [])

  // ── Search + filter + sort ────────────────────────────────────────
  const flatMode = query.trim().length > 0 || activeFilter !== null

  const matchesQuery = useCallback((e: BlackMarketEntry) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      e.name.toLowerCase().includes(q) ||
      e.creator.toLowerCase().includes(q) ||
      e.baseModel.toLowerCase().includes(q) ||
      e.badges.some((b) => b.toLowerCase().includes(q))
    )
  }, [query])

  const flatResults = useMemo(() => {
    let list = entries.filter(matchesQuery)

    // Facet filter
    if (activeFilter === 'reasoning') list = list.filter((e) => e.categories.includes('reasoning') || e.badges.includes('Reasoning'))
    else if (activeFilter === 'coding') list = list.filter((e) => e.categories.includes('coding') || e.badges.includes('Coding'))
    else if (activeFilter === 'vision') list = list.filter((e) => e.badges.includes('Vision'))
    else if (activeFilter === 'experimental') list = list.filter((e) => e.categories.includes('experimental') || e.badges.includes('Experimental'))

    // Sort
    const byDownloads = (a: BlackMarketEntry, b: BlackMarketEntry) => (b.stats.downloads ?? -1) - (a.stats.downloads ?? -1)
    const byLikes = (a: BlackMarketEntry, b: BlackMarketEntry) => (b.stats.likes ?? -1) - (a.stats.likes ?? -1)
    const byDate = (a: BlackMarketEntry, b: BlackMarketEntry) =>
      new Date(b.stats.lastModified ?? 0).getTime() - new Date(a.stats.lastModified ?? 0).getTime()

    if (activeFilter === 'most-downloaded') list = [...list].sort(byDownloads)
    else if (activeFilter === 'highest-rated') list = [...list].sort(byLikes)
    else if (activeFilter === 'newest') list = [...list].sort(byDate)
    else if (activeFilter === 'trending') list = [...list].sort(byDownloads)

    return list
  }, [entries, matchesQuery, activeFilter])

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <Link href="/lab" className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Enry Lab
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">The Black Market</span>
      </header>

      <div className="mb-8">
        <h1 className="mb-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Skull className="h-6 w-6 text-primary" />
          The Black Market
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Explore cutting-edge community fine-tunes, model merges, and experimental checkpoints.
        </p>
        <div className="mt-3 flex items-start gap-2 rounded border border-warning/20 bg-warning/5 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
          <p className="font-mono text-[10px] leading-relaxed text-warning/90">
            Experimental &amp; unofficial. These are community creations, separate from Enry&apos;s official model registry —
            informational only. Nothing here is installed, routed, or run.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-2 rounded border border-border bg-surface-secondary px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, creator, base model, or tag…"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className="flex-1 bg-transparent font-mono text-[12px] text-foreground placeholder-muted-foreground/40 focus:outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="font-mono text-[10px] text-muted-foreground hover:text-foreground">
            clear
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter((cur) => (cur === f.id ? null : f.id))}
            className={`rounded border px-2.5 py-1 font-mono text-[10px] transition-colors ${
              activeFilter === f.id
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-surface-secondary text-muted-foreground hover:border-primary/30 hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
        {(activeFilter || query) && (
          <button
            onClick={() => { setActiveFilter(null); setQuery('') }}
            className="rounded border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-mono text-[11px]">Loading community models &amp; live Hugging Face stats…</span>
        </div>
      ) : loadError ? (
        <div className="flex items-start gap-2 rounded border border-warning/40 bg-warning/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
          <span className="font-mono text-[11px] text-warning">Could not load the gallery: {loadError}</span>
        </div>
      ) : flatMode ? (
        <FlatGrid entries={flatResults} onOpen={setSelected} />
      ) : (
        <div className="space-y-10">
          {SECTION_ORDER.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              entries={entries.filter((e) => e.categories.includes(cat))}
              onOpen={setSelected}
            />
          ))}
        </div>
      )}

      <BlackMarketPanel
        entry={selected}
        onClose={() => setSelected(null)}
        onAddToIdeas={handleAddToIdeas}
        addingToIdeas={selected ? addingId === selected.hfId : false}
        addedToIdeas={selected ? addedIds.has(selected.hfId) : false}
      />
    </div>
  )
}

function CategorySection({
  category, entries, onOpen,
}: {
  category: BlackMarketCategory
  entries: BlackMarketEntry[]
  onOpen: (e: BlackMarketEntry) => void
}) {
  const meta = CATEGORY_META[category]
  return (
    <section>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <span>{meta.emoji}</span> {meta.label}
        </h2>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{meta.blurb}</p>
      </div>
      {entries.length === 0 ? (
        <div className="rounded border border-dashed border-border p-6 text-center">
          <p className="text-[12px] text-muted-foreground">
            {category === 'verified'
              ? 'No models verified yet. Models earn this badge from measured benchmark performance — not popularity — once the benchmark engine ships.'
              : 'No models in this category yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {entries.map((e) => <BlackMarketCard key={e.hfId} entry={e} onOpen={onOpen} />)}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}

function FlatGrid({ entries, onOpen }: { entries: BlackMarketEntry[]; onOpen: (e: BlackMarketEntry) => void }) {
  if (entries.length === 0) {
    return (
      <div className="rounded border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground">No models match your search or filter.</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence mode="popLayout">
        {entries.map((e) => <BlackMarketCard key={e.hfId} entry={e} onOpen={onOpen} />)}
      </AnimatePresence>
    </div>
  )
}
