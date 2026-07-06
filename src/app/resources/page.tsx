'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ChevronRight, Loader2, Trash2, BookOpen, Calculator, Dumbbell, Utensils, GitBranch, Target, Timer, Trophy } from 'lucide-react'
import { FlashcardGenerator } from '@/components/tools/flashcard-generator'
import { GradeCalculator } from '@/components/tools/grade-calculator'
import { WorkoutLoggerTool } from '@/components/tools/workout-logger'
import { MealLogger } from '@/components/tools/meal-logger'
import { RepoScanner } from '@/components/tools/repo-scanner'
import { HabitStreaks } from '@/components/tools/habit-streaks'
import { RacePaceCalculator, fmtSecs, RACE_DISTANCES } from '@/components/tools/race-pace-calculator'
import {
  type Resource,
  type ResourceType,
  type FlashcardsPayload,
  type GradeCalcPayload,
  type WorkoutPayload,
  type MealPayload,
  type RepoScanPayload,
  type HabitStreakPayload,
  type RacePacePayload,
  loadResources,
  deleteResource,
  resourceSummary,
} from '@/lib/resources'

const TABS: { id: ResourceType; label: string; icon: typeof BookOpen }[] = [
  { id: 'flashcards',    label: 'Flashcards',   icon: BookOpen },
  { id: 'grade_calc',   label: 'Grade Calc',    icon: Calculator },
  { id: 'workout',      label: 'Workout',       icon: Dumbbell },
  { id: 'meal',         label: 'Meal',          icon: Utensils },
  { id: 'repo_scan',    label: 'Repo Scanner',  icon: GitBranch },
  { id: 'habit_streak', label: 'Habits',        icon: Target },
  { id: 'race_pace',    label: 'Race Pace',     icon: Timer },
]

function shortDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function timeAgo(iso: string): string {
  const then = new Date(iso)
  const ms = Date.now() - then.getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  // "yesterday" if the date is exactly the previous calendar day
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString()) return 'yesterday'
  // Within this year: "Mar 3"
  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  // Older: "Mar 3, 2025"
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function DetailModal({ item, onClose }: { item: Resource; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded border border-border bg-surface-secondary p-5 shadow-2xl scrollbar-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-surface-elevated">
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        <h3 className="mb-1 pr-8 text-sm font-semibold text-foreground">{item.title}</h3>
        <p className="mb-4 font-mono text-[10px] text-muted-foreground">{timeAgo(item.created_at)}</p>
        <PayloadView resource={item} />
      </motion.div>
    </motion.div>
  )
}

function PayloadView({ resource }: { resource: Resource }) {
  switch (resource.type) {
    case 'flashcards': {
      const p = resource.payload as FlashcardsPayload
      return (
        <div className="space-y-2">
          {p.cards?.map((c, i) => (
            <div key={i} className="rounded border border-border bg-surface-elevated p-2.5 text-xs">
              <p className="font-medium text-foreground">Q: {c.question}</p>
              <p className="mt-1 text-muted-foreground">A: {c.answer}</p>
            </div>
          ))}
        </div>
      )
    }
    case 'grade_calc': {
      const p = resource.payload as GradeCalcPayload
      return (
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="rounded border border-border bg-surface-elevated px-3 py-2 text-center">
              <p className="font-mono text-xl font-semibold text-foreground">{typeof p.weightedGpa === 'number' ? p.weightedGpa.toFixed(2) : '—'}</p>
              <p className="text-[10px] text-muted-foreground">GPA</p>
            </div>
            <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-center">
              <p className="font-mono text-xl font-semibold text-primary">{p.targetGpa}</p>
              <p className="text-[10px] text-muted-foreground">Target</p>
            </div>
          </div>
          {p.classes?.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5 text-xs">
              <span className="text-foreground">{c.name || '(unnamed)'}</span>
              <span className="font-mono text-muted-foreground">{c.currentGrade}% · {c.credits}cr</span>
            </div>
          ))}
        </div>
      )
    }
    case 'workout': {
      const p = resource.payload as WorkoutPayload
      return (
        <div className="space-y-2">
          <p className="font-mono text-sm font-semibold text-foreground">{p.exercise}</p>
          {p.sets?.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5 text-xs">
              <span className="text-muted-foreground">Set {i + 1}</span>
              <span className="font-mono text-foreground">{s.reps} reps × {s.weight} lbs</span>
            </div>
          ))}
        </div>
      )
    }
    case 'meal': {
      const p = resource.payload as MealPayload
      return (
        <div className="space-y-3">
          <p className="text-sm text-foreground">{p.description}</p>
          <div className="grid grid-cols-4 gap-2">
            {[['Calories', p.calories], ['Protein', `${p.protein}g`], ['Carbs', `${p.carbs}g`], ['Fat', `${p.fat}g`]].map(([l, v]) => (
              <div key={l as string} className="rounded border border-border bg-surface-elevated px-2 py-2 text-center">
                <p className="font-mono text-sm font-semibold text-foreground">{v}</p>
                <p className="text-[10px] text-muted-foreground">{l}</p>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'repo_scan': {
      const p = resource.payload as RepoScanPayload
      return (
        <div className="space-y-2">
          <p className="font-mono text-sm font-semibold text-foreground">{p.name}</p>
          {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{p.language}</span>
            <span>{p.stars} ★</span>
            <span>{p.fileTree?.length} files</span>
          </div>
          {p.topics?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {p.topics.slice(0, 8).map((t) => (
                <span key={t} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{t}</span>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'habit_streak': {
      const p = resource.payload as HabitStreakPayload
      return (
        <div className="space-y-2">
          <p className="text-sm text-foreground">{p.habit_name}</p>
          <div className="flex gap-3 text-xs">
            <span className="text-muted-foreground">Checked on {p.checked_on}</span>
            {p.streak > 0 && <span className="font-mono text-warning">{p.streak}d streak</span>}
          </div>
        </div>
      )
    }
    case 'race_pace': {
      const p = resource.payload as RacePacePayload
      if (p.mode === 'calculation') {
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xl font-bold text-foreground">{fmtSecs(p.time_seconds)}</span>
              <span className="font-mono text-xs text-muted-foreground">{p.distance}</span>
              {p.strategy && (
                <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] capitalize text-muted-foreground">
                  {p.strategy.replace('_', ' ')}
                </span>
              )}
            </div>
            {p.splits && p.splits.length > 1 && (
              <div className="overflow-hidden rounded border border-border">
                <div className="grid grid-cols-3 bg-surface-base px-3 py-1.5">
                  {['Split', 'Time', 'Total'].map((h) => (
                    <span key={h} className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{h}</span>
                  ))}
                </div>
                <div className="divide-y divide-border/40">
                  {p.splits.map((s, i) => {
                    const cum = p.splits!.slice(0, i + 1).reduce((a, b) => a + b, 0)
                    return (
                      <div key={i} className="grid grid-cols-3 px-3 py-2">
                        <span className="font-mono text-xs text-muted-foreground">Split {i + 1}</span>
                        <span className="font-mono text-xs font-medium text-foreground">{fmtSecs(s)}</span>
                        <span className="font-mono text-xs text-muted-foreground">{fmtSecs(cum)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      }
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xl font-bold text-foreground">{fmtSecs(p.time_seconds)}</span>
            <span className="font-mono text-xs text-muted-foreground">{p.distance}</span>
            {p.is_pr && (
              <span className="flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-[10px] text-warning">
                <Trophy className="h-2.5 w-2.5" />PR
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 font-mono text-xs text-muted-foreground">
            {p.date && <span>{shortDate(p.date)}</span>}
            {p.meet && <span>@ {p.meet}</span>}
          </div>
          {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
          {p.splits && p.splits.length > 0 && (
            <div>
              <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Splits</p>
              <div className="flex flex-wrap gap-1">
                {p.splits.map((s, i) => (
                  <span key={i} className="rounded border border-border bg-surface-elevated px-2 py-1 font-mono text-xs text-foreground">
                    {fmtSecs(s)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }
    default:
      return <pre className="text-xs text-muted-foreground">{JSON.stringify(resource.payload, null, 2)}</pre>
  }
}

const DIST_ORDER = ['100m', '200m', '400m', '800m', '1600m', '3200m', '5K']

function PRCards({ items }: { items: Resource[] }) {
  const prMap: Record<string, { time: number; date: string }> = {}
  items.forEach((item) => {
    const p = item.payload as RacePacePayload
    if (p.mode !== 'result') return
    const ex = prMap[p.distance]
    if (!ex || p.time_seconds < ex.time) prMap[p.distance] = { time: p.time_seconds, date: p.date ?? '' }
  })
  const entries = Object.entries(prMap).sort((a, b) => {
    const ai = DIST_ORDER.indexOf(a[0])
    const bi = DIST_ORDER.indexOf(b[0])
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
  })
  if (entries.length === 0) return null
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {entries.map(([dist, { time, date }]) => (
        <div key={dist} className="rounded border border-warning/20 bg-warning/5 px-3 py-2">
          <div className="mb-0.5 flex items-center gap-1">
            <Trophy className="h-2.5 w-2.5 text-warning" />
            <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-warning">{dist} PR</span>
          </div>
          <p className="font-mono text-sm font-bold text-foreground">{fmtSecs(time)}</p>
          {date && <p className="font-mono text-[10px] text-muted-foreground">{shortDate(date)}</p>}
        </div>
      ))}
    </div>
  )
}

function SavedList({ type, refreshKey }: { type: ResourceType; refreshKey: number }) {
  const [items, setItems] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Resource | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    loadResources(type).then((r) => { setItems(r); setLoading(false) })
  }, [type, refreshKey])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDeleting(id)
    await deleteResource(id)
    setItems((prev) => prev.filter((i) => i.id !== id))
    setDeleting(null)
  }

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
  }

  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">No saved items yet for this tool.</p>
  }

  return (
    <>
      {type === 'race_pace' && <PRCards items={items} />}
      <div className="space-y-1.5">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(item)}
              className="group flex cursor-pointer items-center justify-between rounded border border-border/60 bg-surface-elevated/60 px-3 py-2 transition-all duration-200 hover:border-primary/30 hover:bg-surface-elevated hover:shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {resourceSummary(item)} · {timeAgo(item.created_at)}
                </p>
              </div>
              <div className="ml-3 flex flex-shrink-0 items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                <button
                  onClick={(e) => handleDelete(e, item.id)}
                  disabled={deleting === item.id}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-40"
                >
                  {deleting === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </>
  )
}

function ActiveTool({ tab, onSave }: { tab: ResourceType; onSave: () => void }) {
  const props = { onClose: () => {}, mode: 'page' as const, onSave }
  switch (tab) {
    case 'flashcards':    return <FlashcardGenerator {...props} />
    case 'grade_calc':    return <GradeCalculator {...props} />
    case 'workout':       return <WorkoutLoggerTool {...props} />
    case 'meal':          return <MealLogger {...props} />
    case 'repo_scan':     return <RepoScanner {...props} />
    case 'habit_streak':  return <HabitStreaks {...props} />
    case 'race_pace':     return <RacePaceCalculator {...props} />
  }
}

function ResourcesContent() {
  const { status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [saveKey, setSaveKey] = useState(0)

  const rawTab = searchParams.get('tab')
  const validTabs = new Set<string>(TABS.map((t) => t.id))
  const activeTab = (validTabs.has(rawTab ?? '') ? rawTab : 'flashcards') as ResourceType

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-base">
      {/* Sticky header: nav + tabs */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Chat
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">resources</span>
          <Link
            href="/resources/saved"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Saved
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div
          className="relative flex overflow-x-auto border-t border-border/50 scrollbar-hidden"
          role="tablist"
          aria-label="Resource types"
          onKeyDown={(e) => {
            const tabs = TABS
            const idx = tabs.findIndex((t) => t.id === activeTab)
            let next = idx
            if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
            else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
            else return
            e.preventDefault()
            router.replace(`/resources?tab=${tabs[next].id}`)
          }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => router.replace(`/resources?tab=${tab.id}`)}
                className={`relative flex flex-shrink-0 items-center gap-1.5 px-4 py-2.5 font-mono text-[11px] whitespace-nowrap transition-colors duration-200 ${
                  active
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3 w-3" />
                {tab.label}
                {active && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        {/* Tool panel */}
        <ActiveTool key={activeTab} tab={activeTab} onSave={() => setSaveKey((k) => k + 1)} />

        {/* Saved items */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Saved</p>
            <Link href={`/resources/saved?tab=${activeTab}`} className="text-[10px] text-muted-foreground hover:text-primary">
              View all →
            </Link>
          </div>
          <SavedList type={activeTab} refreshKey={saveKey} />
        </div>
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
