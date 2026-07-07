'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Search, X, Loader2, Archive } from 'lucide-react'
import type { PromptPayload } from '@/lib/resources'
import { isArchived } from '@/lib/resource-source'
import { PromptCard, type UserPrompt } from '@/app/prompts/page'

export default function PromptsArchivePage() {
  const [items, setItems] = useState<UserPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/resources?type=prompt&source=daily_auto')
      .then((r) => r.json())
      .then((d) => setItems((d.resources ?? []).filter((r: UserPrompt) => isArchived(r.created_at))))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const displayed = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter((p) => {
      const pp = p.payload as PromptPayload
      return (
        p.title.toLowerCase().includes(q) ||
        pp.body.toLowerCase().includes(q) ||
        (pp.tags ?? []).some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [items, searchQuery])

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link href="/prompts?tab=daily" className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Daily Prompts
          </Link>
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <Archive className="h-3 w-3" />
            prompt archive
          </span>
          <div className="w-20" />
        </div>
      </header>

      <div className="border-b border-border/50 bg-surface-base px-4 py-3">
        <div className="relative mx-auto max-w-3xl">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search archived prompts…"
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
              {searchQuery ? 'No archived prompts match your search.' : 'Nothing archived yet.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Daily prompts move here automatically after 30 days.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {displayed.length} archived prompt{displayed.length !== 1 ? 's' : ''}
            </p>
            <AnimatePresence mode="popLayout">
              {displayed.map((p, i) => (
                <PromptCard key={p.id} prompt={p} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  )
}
