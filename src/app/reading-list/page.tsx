'use client'

import { Suspense, useState, useMemo } from 'react'
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
} from 'lucide-react'

/* ─────────────────────────────────────────────────────────
 *  Article data — curated from docs/reading-list.md
 * ───────────────────────────────────────────────────────── */

interface Article {
  title: string
  author: string
  source: string
  url: string
  why: string
  category: 'ai/tech' | 'training/athletics' | 'thinking/writing' | 'building/product' | 'general'
}

const ARTICLES: Article[] = [
  // ── AI / Tech ──
  {
    title: 'Software 2.0',
    author: 'Andrej Karpathy',
    source: 'karpathy.medium.com',
    url: 'https://karpathy.medium.com/software-2-0-a64152b37c35',
    why: 'The essay that defines the paradigm shift: neural networks are a new way to write software — by curating data instead of writing logic.',
    category: 'ai/tech',
  },
  {
    title: 'Stuff we figured out about AI in 2023',
    author: 'Simon Willison',
    source: 'simonwillison.net',
    url: 'https://simonwillison.net/2023/Dec/31/ai-in-2023/',
    why: 'The clearest, most honest annual review of what LLMs can and can\'t do, from someone who actually builds with them.',
    category: 'ai/tech',
  },
  {
    title: 'Tracing the thoughts of a large language model',
    author: 'Anthropic',
    source: 'anthropic.com',
    url: 'https://www.anthropic.com/research/tracing-thoughts-language-model',
    why: 'A rare look inside the black box — how neural circuits handle translation, rhyming, and math, showing model behavior is rooted in real mathematical pathways.',
    category: 'ai/tech',
  },
  {
    title: 'Building effective agents',
    author: 'Anthropic',
    source: 'anthropic.com',
    url: 'https://www.anthropic.com/engineering/building-effective-agents',
    why: 'A grounding manual for AI-powered tools — workflows vs. agents, routing patterns, and treating tool definitions as "agent-computer interfaces."',
    category: 'ai/tech',
  },

  // ── Training / Athletics ──
  {
    title: 'What speed training really means',
    author: 'Juggernaut Training Systems',
    source: 'jtsstrength.com',
    url: 'https://www.jtsstrength.com/what-speed-training-really-means/',
    why: 'The most important principle for a young track athlete: to get faster, sprint at 95%+ of max velocity. Running tired teaches slow mechanics.',
    category: 'training/athletics',
  },
  {
    title: 'Periodization: what the data say',
    author: 'Stronger by Science',
    source: 'strongerbyscience.com',
    url: 'https://www.strongerbyscience.com/periodization-data/',
    why: 'Evidence-based breakdown of structuring training over time — cycling volume, intensity, and recovery phases for peak performance.',
    category: 'training/athletics',
  },
  {
    title: 'Recovery techniques for athletes',
    author: 'Gatorade Sports Science Institute',
    source: 'gssiweb.org',
    url: 'https://www.gssiweb.org/sports-science-exchange/article/sse-120-recovery-techniques-for-athletes',
    why: 'Sorts recovery science from bro-science. Bottom line: sleep and nutrition are the only non-negotiable tools; adolescent athletes need 8–10 hours.',
    category: 'training/athletics',
  },

  // ── Thinking / Writing ──
  {
    title: 'How to think for yourself',
    author: 'Paul Graham',
    source: 'paulgraham.com',
    url: 'https://www.paulgraham.com/think.html',
    why: 'Independent-mindedness isn\'t just intelligence — it\'s a specific fastidiousness about truth combined with the willingness to ignore the crowd.',
    category: 'thinking/writing',
  },
  {
    title: 'Book review: The Scout Mindset',
    author: 'Scott Alexander (Astral Codex Ten)',
    source: 'astralcodexten.com',
    url: 'https://www.astralcodexten.com/p/book-review-the-scout-mindset',
    why: 'The difference between wanting to be right (soldier) and wanting to see reality clearly (scout). Essential for making good decisions.',
    category: 'thinking/writing',
  },
  {
    title: 'Why and how to write things on the Internet',
    author: 'Ben Kuhn',
    source: 'benkuhn.net',
    url: 'https://www.benkuhn.net/writing/',
    why: 'Using writing as a thinking tool — lowering the bar for publishing is the fastest way to develop clarity and build a network.',
    category: 'thinking/writing',
  },

  // ── Building / Product ──
  {
    title: 'Do things that don\'t scale',
    author: 'Paul Graham',
    source: 'paulgraham.com',
    url: 'https://www.paulgraham.com/ds.html',
    why: 'The canonical essay for builders: manual, unscalable effort (recruiting users one-by-one, white-glove service) is the fastest path to product-market fit.',
    category: 'building/product',
  },
  {
    title: 'Frighteningly ambitious startup ideas',
    author: 'Paul Graham',
    source: 'paulgraham.com',
    url: 'https://www.paulgraham.com/ambitious.html',
    why: 'The best ideas often seem terrifying. Live in the future, notice what\'s missing, and build the thing you wish existed.',
    category: 'building/product',
  },
  {
    title: 'Essays & writing on craftsmanship',
    author: 'Patrick Collison (Stripe co-founder)',
    source: 'patrickcollison.com',
    url: 'https://patrickcollison.com/',
    why: 'A collection on craftsmanship, pace, and building things that last — the quality of your interfaces and code becomes your marketing.',
    category: 'building/product',
  },

  // ── General ──
  {
    title: 'On keeping a notebook',
    author: 'Joan Didion',
    source: 'PDF',
    url: 'https://cdn.thewirecutter.com/wp-content/uploads/2020/04/Joan-Didion-On-Keeping-a-Notebook.pdf',
    why: 'The best essay ever written about why we write things down — not to record facts, but to record how things felt and why they mattered.',
    category: 'general',
  },
  {
    title: 'Once more to the lake',
    author: 'E. B. White',
    source: 'PDF',
    url: 'http://www.davidglensmith.com/wcjc/1301/PDFs/white-demo.pdf',
    why: 'A quiet, devastating essay about time, memory, and the shock of realizing you\'ve become the adult. Reads like a short story. Best read in one sitting.',
    category: 'general',
  },
]

/* ─────────────────────────────────────────────────────────
 *  Constants
 * ───────────────────────────────────────────────────────── */

interface CategoryDef {
  id: Article['category']
  label: string
  icon: typeof BookOpen
  description: string
}

const CATEGORIES: CategoryDef[] = [
  { id: 'ai/tech',            label: 'AI / Tech',           icon: Brain,     description: 'Foundational essays on how AI actually works' },
  { id: 'training/athletics', label: 'Training / Athletics', icon: Dumbbell, description: 'Evidence-based training, recovery, and mechanics' },
  { id: 'thinking/writing',   label: 'Thinking / Writing',  icon: PenLine,  description: 'Clear thinking, writing well, decision-making' },
  { id: 'building/product',   label: 'Building / Product',  icon: Rocket,   description: 'Startup essays, engineering culture, indie hacking' },
  { id: 'general',            label: 'General',             icon: Sparkles, description: 'Essays that don\'t fit elsewhere but are worth reading anyway' },
]

const CATEGORY_ICONS: Record<string, typeof BookOpen> = {
  'ai/tech': Brain,
  'training/athletics': Dumbbell,
  'thinking/writing': PenLine,
  'building/product': Rocket,
  general: Sparkles,
}

function catStyle(cat: string): string {
  switch (cat) {
    case 'ai/tech':            return 'text-[#00ff66] border-[#00ff66]/30 bg-[#00ff66]/8'
    case 'training/athletics': return 'text-[#ff4d4d] border-[#ff4d4d]/30 bg-[#ff4d4d]/8'
    case 'thinking/writing':   return 'text-[#00c8ff] border-[#00c8ff]/30 bg-[#00c8ff]/8'
    case 'building/product':   return 'text-[#ffb800] border-[#ffb800]/30 bg-[#ffb800]/8'
    case 'general':            return 'text-[#a78bfa] border-[#a78bfa]/30 bg-[#a78bfa]/8'
    default:                   return 'text-muted-foreground border-border bg-surface-elevated'
  }
}

/* ─────────────────────────────────────────────────────────
 *  Article card
 * ───────────────────────────────────────────────────────── */

function ArticleCard({ article, index }: { article: Article; index: number }) {
  const Icon = CATEGORY_ICONS[article.category] ?? BookOpen
  const style = catStyle(article.category)

  return (
    <motion.a
      layout
      href={article.url}
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
              {article.title}
              <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {article.author} · <span className="font-mono text-[10px]">{article.source}</span>
            </p>
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{article.why}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${style}`}>
            {CATEGORIES.find((c) => c.id === article.category)?.label ?? article.category}
          </span>
        </div>
      </div>
    </motion.a>
  )
}

/* ─────────────────────────────────────────────────────────
 *  Page content
 * ───────────────────────────────────────────────────────── */

function ReadingListContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawCat = searchParams.get('category')
  const validCats = new Set<string>(CATEGORIES.map((c) => c.id))
  const activeCategory = (validCats.has(rawCat ?? '') ? rawCat : null) as Article['category'] | null

  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    let items = ARTICLES
    if (activeCategory) {
      items = items.filter((a) => a.category === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q) ||
          a.why.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q),
      )
    }
    return items
  }, [activeCategory, searchQuery])

  const setCategory = (cat: string | null) => {
    router.replace(cat ? `/reading-list?category=${cat}` : '/reading-list')
  }

  return (
    <div className="min-h-screen bg-transparent">
      {/* Sticky header */}
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
              {ARTICLES.length}
            </span>
          </div>
          <div className="w-14" />
        </div>

        {/* Category tabs */}
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
            const count = ARTICLES.filter((a) => a.category === cat.id).length
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

      {/* Subtitle + search */}
      <div className="border-b border-border/50 px-4 py-3">
        <p className="mb-3 text-center text-xs leading-relaxed text-muted-foreground">
          15 essays curated for a 9th-grade student-athlete who builds AI apps, runs track, lifts, reads seriously, and wants to think well.
          <br />No listicles. No hype. Only things worth rereading.
        </p>
        <div className="relative mx-auto max-w-3xl">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            placeholder="Search by title, author, or description…"
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

      {/* Article list */}
      <main className="mx-auto max-w-3xl px-4 py-6">
        {filtered.length === 0 ? (
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
            <p className="mb-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {filtered.length} article{filtered.length !== 1 ? 's' : ''}
              {activeCategory ? ` · ${CATEGORIES.find((c) => c.id === activeCategory)?.label}` : ''}
              {searchQuery ? ` · matching "${searchQuery}"` : ''}
            </p>
            <AnimatePresence mode="popLayout">
              {filtered.map((article, i) => (
                <ArticleCard key={article.title + article.author} article={article} index={i} />
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
