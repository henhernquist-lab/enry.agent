'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Search, X, Loader2, Archive, ChevronLeft } from 'lucide-react'
import type { Resource, ArticleNotePayload } from '@/lib/resources'
import { isArchived } from '@/lib/resource-source'
import { ArticleNoteCard, ArticleNoteDetail } from '@/components/tools/article-notes'

export default function ArticlesArchivePage() {
  const [items, setItems] = useState<Resource<ArticleNotePayload>[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selected, setSelected] = useState<Resource<ArticleNotePayload> | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/resources?type=article_note&source=daily_auto')
      .then((r) => r.json())
      .then((d) => setItems((d.resources ?? []).filter((r: Resource<ArticleNotePayload>) => isArchived(r.created_at))))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const displayed = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter((r) => {
      const p = r.payload as ArticleNotePayload
      return (
        p.article_title.toLowerCase().includes(q) ||
        p.source_domain.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q))
      )
    })
  }, [items, searchQuery])

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className="min-h-screen bg-transparent">
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link href="/resources/articles" className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Daily Articles
          </Link>
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <Archive className="h-3 w-3" />
            article archive
          </span>
          <div className="w-24" />
        </div>
      </header>

      <div className="border-b border-border/50 bg-surface-base px-4 py-3">
        <div className="relative mx-auto max-w-3xl">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search archived articles…"
            className="w-full rounded border border-border bg-surface-elevated py-2 pl-9 pr-8 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-16 text-center">
            <Archive className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              {searchQuery ? 'No archived articles match your search.' : 'Nothing archived yet.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Daily articles move here automatically after 30 days.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {displayed.length} archived article{displayed.length !== 1 ? 's' : ''}
            </p>
            <AnimatePresence>
              {displayed.map((r) => (
                <ArticleNoteCard key={r.id} resource={r} onOpen={setSelected} onDelete={handleDelete} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded border border-border bg-surface-secondary p-5 shadow-2xl scrollbar-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute left-3 top-3 flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h3 className="mb-1 px-6 text-sm font-semibold text-foreground">
                {(selected.payload as ArticleNotePayload).article_title}
              </h3>
              <p className="mb-4 px-6 font-mono text-[10px] text-muted-foreground">
                {new Date(selected.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <ArticleNoteDetail resource={selected} onStudyThis={() => setSelected(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
