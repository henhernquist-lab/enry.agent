'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Loader2,
  BookOpen,
  Calculator,
  Dumbbell,
  Utensils,
  GitBranch,
  Target,
  BookMarked,
  Newspaper,
  Library,
  Circle,
  Timer,
  ScanSearch,
  Hourglass,
  SmilePlus,
  StickyNote,
  Bell,
} from 'lucide-react'
import type { ResourceType } from '@/lib/resources'
import { loadResources } from '@/lib/resources'

/* ─── Tool Definitions ─────────────────────────────────── */

interface ToolDef {
  slug: string
  type: ResourceType
  name: string
  desc: string
  icon: typeof BookOpen
}

const TOOLS: ToolDef[] = [
  { slug: 'flashcards',       type: 'flashcards',   name: 'Flashcard Generator', desc: 'Paste notes → AI-generated Anki cards',               icon: BookOpen },
  { slug: 'grade-calculator', type: 'grade_calc',   name: 'Grade Calculator',    desc: 'What do you need on finals for target GPA?',          icon: Calculator },
  { slug: 'workout',          type: 'workout',       name: 'Workout Logger',      desc: 'Track sets, reps, and weight over time',             icon: Dumbbell },
  { slug: 'meal',             type: 'meal',          name: 'Meal Logger',         desc: 'Plain-English logging with macro estimation',        icon: Utensils },
  { slug: 'repo-scanner',     type: 'repo_scan',     name: 'Repo Scanner',        desc: 'Fetch a GitHub repo and chat about the code',        icon: GitBranch },
  { slug: 'habits',           type: 'habit_streak',  name: 'Habit Streaks',       desc: 'Daily check-ins with streak tracking',              icon: Target },
  { slug: 'prompts',          type: 'prompt',        name: 'Prompt Library',      desc: 'Browse and save reusable AI prompts',               icon: BookMarked },
  { slug: 'articles',         type: 'article_note',   name: 'Article Notes',       desc: 'Save articles with AI summaries and flashcards',    icon: Newspaper },
  { slug: 'race-pace',        type: 'race_pace',       name: 'Race Pace Calculator', desc: 'Split targets and PR tracking',                     icon: Timer },
  { slug: 'repo-review',      type: 'repo_review',     name: 'Repo Reviewer',       desc: 'AI code review for your GitHub repos',              icon: ScanSearch },
  { slug: 'countdown',        type: 'countdown',       name: 'Meet/Game Countdown', desc: 'Upcoming events with live day counts',              icon: Hourglass },
  { slug: 'checkin',          type: 'checkin',         name: 'Daily Check-in',      desc: 'Rate your day, track the trend',                    icon: SmilePlus },
  { slug: 'notes',            type: 'note',            name: 'Quick Notes',         desc: 'Fast capture, no fuss',                             icon: StickyNote },
  { slug: 'schedule',         type: 'bell_schedule',   name: 'Bell Schedule',       desc: 'Current period and countdown to the next',          icon: Bell },
]

/* ─── Saved count fetcher ───────────────────────────────── */

function useSavedCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    Promise.all(
      TOOLS.map(async (tool) => {
        try {
          const items = await loadResources(tool.type)
          return { type: tool.type, count: items.length }
        } catch {
          return { type: tool.type, count: 0 }
        }
      }),
    ).then((results) => {
      if (!cancelled) {
        const map: Record<string, number> = {}
        for (const r of results) map[r.type] = r.count
        setCounts(map)
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [])

  return { counts, loading }
}

/* ─── Responsive grid hook ──────────────────────────────── */

function useGridLayout() {
  const [cols, setCols] = useState(2)
  const [rows, setRows] = useState(2)

  useEffect(() => {
    const calc = () => {
      const mobile = window.innerWidth < 640
      setCols(mobile ? 1 : 2)
      setRows(mobile ? 2 : 2)
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  const perPage = cols * rows
  const totalPages = Math.ceil(TOOLS.length / perPage)
  return { cols, rows, perPage, totalPages }
}

/* ─── Grid page ────────────────────────────────────────── */

function ResourcesContent() {
  const { status } = useSession()
  const router = useRouter()
  const { counts, loading: countsLoading } = useSavedCounts()
  const { cols, perPage, totalPages } = useGridLayout()
  const [page, setPage] = useState(0)

  // Clamp page when layout changes
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages - 1))
  }, [totalPages])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const totalSaved = Object.values(counts).reduce((a, b) => a + b, 0)

  const pageTools = TOOLS.slice(page * perPage, page * perPage + perPage)

  const goNext = () => setPage((p) => Math.min(p + 1, totalPages - 1))
  const goPrev = () => setPage((p) => Math.max(p - 1, 0))

  // Keyboard navigation for page switching
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
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
            <Library className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              resources
            </span>
            {totalSaved > 0 && (
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                {totalSaved} saved
              </span>
            )}
          </div>
          <Link
            href="/resources/saved"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Saved
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-8 lg:px-12 lg:py-10">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-foreground">Tools &amp; Resources</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {TOOLS.length} tools ·{' '}
            {countsLoading ? '…' : `${totalSaved} saved across all tools`}
          </p>
        </div>

        {/* Grid with page transition */}
        <div className="relative flex-1 overflow-hidden">
          {/* Swipe gesture layer — sits behind the grid so links still click */}
          <div
            className="absolute inset-0 z-0"
            onTouchStart={(e) => {
              const touch = e.touches[0]
              ;(e.currentTarget as HTMLDivElement).dataset.startX = String(touch.clientX)
            }}
            onTouchEnd={(e) => {
              const startX = parseFloat((e.currentTarget as HTMLDivElement).dataset.startX || '0')
              const endX = e.changedTouches[0].clientX
              const delta = endX - startX
              if (delta < -50) goNext()
              else if (delta > 50) goPrev()
            }}
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative z-10 h-full"
            >
              <div
                className="grid h-full gap-4 lg:gap-5"
                style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
              >
                {pageTools.map((tool, i) => {
                  const Icon = tool.icon
                  const count = counts[tool.type] ?? 0
                  return (
                    <motion.a
                      key={tool.slug}
                      href={`/resources/${tool.slug}`}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07, type: 'spring', stiffness: 300, damping: 26 }}
                      className="group flex flex-col gap-5 rounded-lg border border-border bg-surface-secondary p-6 shadow-sm shadow-black/20 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-black/30 lg:p-7"
                    >
                      <div className="flex items-start gap-4">
                        {/* Icon container with hover glow */}
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 transition-all duration-300 group-hover:border-primary/40 group-hover:bg-primary/15 group-hover:shadow-[0_0_16px_rgba(0,255,102,0.10)]">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <h3 className="text-base font-bold tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary">
                            {tool.name}
                          </h3>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {tool.desc}
                          </p>
                        </div>
                        <ChevronRight className="mt-2 h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100" />
                      </div>

                      {/* Saved count footer */}
                      <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-3">
                        {countsLoading ? (
                          <div className="flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            <span className="font-mono text-[10px] text-muted-foreground">
                              Loading…
                            </span>
                          </div>
                        ) : count > 0 ? (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {count} saved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/50">
                            <Circle className="h-1.5 w-1.5 fill-current" />
                            No items yet
                          </span>
                        )}
                      </div>
                    </motion.a>
                  )
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Page indicators + nav arrows */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              onClick={goPrev}
              disabled={page === 0}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex gap-2" role="tablist" aria-label="Tool pages">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={i === page}
                  aria-label={`Page ${i + 1}`}
                  onClick={() => setPage(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === page
                      ? 'w-6 bg-primary shadow-[0_0_8px_rgba(0,255,102,0.25)]'
                      : 'w-2 bg-border hover:bg-muted-foreground/40'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={goNext}
              disabled={page === totalPages - 1}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
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

export default function ResourcesPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ResourcesContent />
    </Suspense>
  )
}
