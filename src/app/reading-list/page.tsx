'use client'

import { Suspense, useState, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ExternalLink,
  Search,
  X,
  BookOpen,
  Brain,
  Dumbbell,
  PenLine,
  Rocket,
  Sparkles,
  Loader2,
  Archive,
} from 'lucide-react'
import type { Resource, ArticleNotePayload } from '@/lib/resources'

type Topic = 'ai' | 'training' | 'writing' | 'building' | 'general'

interface CategoryDef {
  id: Topic
  label: string
  icon: typeof BookOpen
  description: string
}

const CATEGORIES: CategoryDef[] = [
  { id: 'ai',       label: 'AI / Tech',           icon: Brain,     description: 'Essays on how AI works and how to use it' },
  { id: 'training', label: 'Training / Athletics', icon: Dumbbell, description: 'Evidence-based training, recovery, and mechanics' },
  { id: 'writing',  label: 'Thinking / Writing',   icon: PenLine,  description: 'Clear thinking, writing well, decision-making' },
  { id: 'building', label: 'Building / Product',    icon: Rocket,   description: 'Startup essays, engineering culture, indie hacking' },
  { id: 'general',  label: 'General',              icon: Sparkles, description: 'Essays that don\'t fit elsewhere but are worth reading' },
]

const CATEGORY_ICONS: Record<string, typeof BookOpen> = {
  ai: Brain, training: Dumbbell, writing: PenLine, building: Rocket, general: Sparkles,
}

function catStyle(cat: string): string {
  switch (cat) {
    case 'ai':       return 'text-[#00ff66] border-[#00ff66]/30 bg-[#00ff66]/8'
    case 'training': return 'text-[#ff4d4d] border-[#ff4d4d]/30 bg-[#ff4d4d]/8'
    case 'writing':  return 'text-[#00c8ff] border-[#00c8ff]/30 bg-[#00c8ff]/8'
    case 'building': return 'text-[#ffb800] border-[#ffb800]/30 bg-[#ffb800]/8'
    case 'general':  return 'text-[#a78bfa] border-[#a78bfa]/30 bg-[#a78bfa]/8'
    default:         return 'text-muted-foreground border-border bg-surface-elevated'
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type ArticleResource = Resource<ArticleNotePayload>

function ArticleCard({ article, index }: { article: ArticleResource; index: number }) {
  const p = article.payload
  const topic = p.topic ?? 'general'
  const Icon = CATEGORY_ICONS[topic] ?? BookOpen
  const style = catStyle(topic)
  const flashcardCount = (p.flashcards ?? []).length

  return (
    <motion.a
      layout
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035, type: 'spring', stiffness: 300, damping: 28 }}
      className="group flex items-start gap-3 rounded border border-border bg-surface-secondary p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-sm"
    >
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border ${style}`}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
              {p.article_title}
              <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-mono text-[10px]">{p.source_domain}</span>
              {p.author && <span> · {p.author}</span>}
              <span className="ml-1 text-[10px]">· {fmtDate(p.fetched_at)}</span>
            </p>
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.summary}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${style}`}>
            {CATEGORIES.find((c) => c.id === topic)?.label ?? topic}
          </span>
          {(p.tags ?? []).slice(0, 3).map((t, i) => (
            <span key={t} className="rounded border border-border bg-surface-base px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
              {t}
            </span>
          ))}
          {flashcardCount > 0 && (
            <span className="ml-auto rounded border border-border/50 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
              {flashcardCount} flashcard{flashcardCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </motion.a>
  )
}

function ReadingListContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawCat = searchParams.get('category')
  const validCats = new Set<string>(CATEGORIES.map((c) => c.id))
  const activeCategory = (validCats.has(rawCat ?? '') ? rawCat : null) as Topic | null

  const [articles, setArticles] = useState<ArticleResource[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/resources?type=article_note')
      .then((r) => r.json())
      .then((d) => setArticles((d.resources ?? []) as ArticleResource[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let items = articles
    if (activeCategory) {
      items = items.filter((a) => (a.payload.topic ?? 'general') === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (a) =>
          a.payload.article_title.toLowerCase().includes(q) ||
          a.payload.source_domain.toLowerCase().includes(q) ||
          (a.payload.summary ?? '').toLowerCase().includes(q) ||
          (a.payload.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      )
    }
    return items
  }, [articles, activeCategory, searchQuery])

  const setCategory = (cat: string | null) => {
    router.replace(cat ? `/reading-list?category=${cat}` : '/reading-list')
  }

  return (
    <div className="min-h-screen bg-transparent">
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Chat
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">reading list</span>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
              {articles.length}
            </span>
          </div>
          <div className="w-14" />
        </div>

        <div
          className="relative flex overflow-x-auto border-t border-border/50 scrollbar-hidden"
          role="tablist"
          aria-label="Article categories"
          onKeyDown={(e: React.KeyboardEvent) => {
            const tabs = [{ id: null }, ...CATEGORIES]
            const idx = tabs.findIndex((t) => t.id === activeCategory)
            let next = idx
            if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
            else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
            else return
            e.preventDefault()
            setCategory(tabs[next].id as string | null)
          }}
        >
          <button
            role="tab"
            aria-selected={activeCategory === null}
            tabIndex={activeCategory === null ? 0 : -1}
            onClick={() => setCategory(null)}
            className={`relative flex flex-shrink-0 items-center gap-1.5 px-4 py-2.5 font-mono text-[11px] whitespace-nowrap transition-colors duration-200 ${
              activeCategory === null ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            All
            {activeCategory === null && (
              <motion.div
                layoutId="cat-indicator"
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-foreground"
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              />
            )}
          </button>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const active = activeCategory === cat.id
            const count = activeCategory
              ? (activeCategory === cat.id ? filtered.length : 0)
              : articles.filter((a) => (a.payload.topic ?? 'general') === cat.id).length
            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setCategory(cat.id)}
                className={`relative flex flex-shrink-0 items-center gap-1.5 px-4 py-2.5 font-mono text-[11px] whitespace-nowrap transition-colors duration-200 ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3 w-3" />
                {cat.label}
                <span className="ml-0.5 text-[9px] opacity-60">{count}</span>
                {active && (
                  <motion.div
                    layoutId="cat-indicator"
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </header>

      <div className="border-b border-border/50 px-4 py-3">
        <p className="mb-3 text-center text-xs leading-relaxed text-muted-foreground">
          {articles.length > 0
            ? `${articles.length} articles generated daily across AI, training, writing, building, and general topics.`
            : 'Articles generate each morning at 10:00 UTC — check back then.'}
          <br />Click any article to read the full piece with AI-generated summaries and flashcards.
        </p>
        <div className="relative mx-auto max-w-3xl">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            placeholder="Search by title, summary, or tags…"
            className="w-full rounded border border-border bg-surface-elevated py-2 pl-9 pr-8 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
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
        ) : articles.length === 0 ? (
          <div className="py-16 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No articles yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The daily article generation runs at 10:00 UTC. Articles will appear here once processed.
            </p>
            <span className="mt-3 inline-flex items-center gap-1 rounded border border-border px-3 py-1 font-mono text-[10px] text-muted-foreground">
              10 new articles per day · 5 topics
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery ? `No articles match "${searchQuery}"` : 'No articles in this category yet.'}
            </p>
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="mt-2 text-xs text-primary hover:underline">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {filtered.length} article{filtered.length !== 1 ? 's' : ''}
                {activeCategory ? ` · ${CATEGORIES.find((c) => c.id === activeCategory)?.label}` : ''}
                {searchQuery ? ` · matching "${searchQuery}"` : ''}
              </p>
              <Link
                href="/resources/articles/archive"
                className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-primary"
              >
                <Archive className="h-3 w-3" />
                Archive
              </Link>
            </div>
            <AnimatePresence mode="popLayout">
              {filtered.map((article, i) => (
                <ArticleCard key={article.id} article={article} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function ReadingListPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ReadingListContent />
    </Suspense>
  )
}
