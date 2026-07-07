'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Loader2,
  Trash2,
  BookOpen,
  Calculator,
  Dumbbell,
  Utensils,
  GitBranch,
  Target,
  BookMarked,
  Newspaper,
  Check,
} from 'lucide-react'
import { FlashcardGenerator } from '@/components/tools/flashcard-generator'
import { GradeCalculator } from '@/components/tools/grade-calculator'
import { WorkoutLoggerTool } from '@/components/tools/workout-logger'
import { MealLogger } from '@/components/tools/meal-logger'
import { RepoScanner } from '@/components/tools/repo-scanner'
import { HabitStreaks } from '@/components/tools/habit-streaks'
import { ArticleNotes, ArticleNotesSavedList } from '@/components/tools/article-notes'
import {
  type Resource,
  type ResourceType,
  type FlashcardsPayload,
  type GradeCalcPayload,
  type WorkoutPayload,
  type MealPayload,
  type RepoScanPayload,
  type HabitStreakPayload,
  type PromptPayload,
  type ArticleNotePayload,
  loadResources,
  deleteResource,
  resourceSummary,
} from '@/lib/resources'

/* ─── Slug → type mapping ──────────────────────────────── */

const SLUG_MAP: Record<string, ResourceType> = {
  'flashcards':       'flashcards',
  'grade-calculator': 'grade_calc',
  'workout':          'workout',
  'meal':             'meal',
  'repo-scanner':     'repo_scan',
  'habits':           'habit_streak',
  'prompts':          'prompt',
  'articles':         'article_note',
}

const SLUG_LABELS: Record<string, { name: string; icon: typeof BookOpen; desc: string }> = {
  'flashcards':       { name: 'Flashcard Generator', icon: BookOpen, desc: 'Paste notes → AI-generated Anki cards' },
  'grade-calculator': { name: 'Grade Calculator',    icon: Calculator, desc: 'What do you need on finals for target GPA?' },
  'workout':          { name: 'Workout Logger',      icon: Dumbbell, desc: 'Track sets, reps, and weight over time' },
  'meal':             { name: 'Meal Logger',         icon: Utensils, desc: 'Plain-English logging with macro estimation' },
  'repo-scanner':     { name: 'Repo Scanner',        icon: GitBranch, desc: 'Fetch a GitHub repo and chat about the code' },
  'habits':           { name: 'Habit Streaks',       icon: Target, desc: 'Daily check-ins with streak tracking' },
  'prompts':          { name: 'Prompt Library',      icon: BookMarked, desc: 'Browse and save reusable AI prompts' },
  'articles':         { name: 'Article Notes',       icon: Newspaper, desc: 'Save articles with AI summaries and flashcards' },
}

/* ─── Helpers ──────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const then = new Date(iso)
  const ms = Date.now() - then.getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const now = new Date()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString()) return 'yesterday'
  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function shortDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ─── DetailModal + PayloadView (from old resources page) */

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
  const p = resource.payload as Record<string, unknown>
  switch (resource.type) {
    case 'flashcards': {
      const cards = (p.cards as { question: string; answer: string }[]) ?? []
      return (
        <div className="space-y-2">
          {cards.map((c, i) => (
            <div key={i} className="rounded border border-border bg-surface-elevated p-2.5 text-xs">
              <p className="font-medium text-foreground">Q: {c.question}</p>
              <p className="mt-1 text-muted-foreground">A: {c.answer}</p>
            </div>
          ))}
        </div>
      )
    }
    case 'grade_calc': {
      const gp = p as unknown as GradeCalcPayload
      return (
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="rounded border border-border bg-surface-elevated px-3 py-2 text-center">
              <p className="font-mono text-xl font-semibold text-foreground">{typeof gp.weightedGpa === 'number' ? gp.weightedGpa.toFixed(2) : '—'}</p>
              <p className="text-[10px] text-muted-foreground">GPA</p>
            </div>
            <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-center">
              <p className="font-mono text-xl font-semibold text-primary">{gp.targetGpa}</p>
              <p className="text-[10px] text-muted-foreground">Target</p>
            </div>
          </div>
          {gp.classes?.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5 text-xs">
              <span className="text-foreground">{c.name || '(unnamed)'}</span>
              <span className="font-mono text-muted-foreground">{c.currentGrade}% · {c.credits}cr</span>
            </div>
          ))}
        </div>
      )
    }
    case 'workout': {
      const wp = p as unknown as WorkoutPayload
      return (
        <div className="space-y-2">
          <p className="font-mono text-sm font-semibold text-foreground">{wp.exercise}</p>
          {wp.sets?.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5 text-xs">
              <span className="text-muted-foreground">Set {i + 1}</span>
              <span className="font-mono text-foreground">{s.reps} reps × {s.weight} lbs</span>
            </div>
          ))}
        </div>
      )
    }
    case 'meal': {
      const mp = p as unknown as MealPayload
      return (
        <div className="space-y-3">
          <p className="text-sm text-foreground">{mp.description}</p>
          <div className="grid grid-cols-4 gap-2">
            {[['Calories', mp.calories], ['Protein', `${mp.protein}g`], ['Carbs', `${mp.carbs}g`], ['Fat', `${mp.fat}g`]].map(([l, v]) => (
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
      const rp = p as unknown as RepoScanPayload
      return (
        <div className="space-y-2">
          <p className="font-mono text-sm font-semibold text-foreground">{rp.name}</p>
          {rp.description && <p className="text-xs text-muted-foreground">{rp.description}</p>}
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{rp.language}</span><span>{rp.stars} ★</span><span>{rp.fileTree?.length} files</span>
          </div>
        </div>
      )
    }
    case 'habit_streak': {
      const hp = p as unknown as HabitStreakPayload
      return (
        <div className="space-y-2">
          <p className="text-sm text-foreground">{hp.habit_name}</p>
          <div className="flex gap-3 text-xs">
            <span className="text-muted-foreground">Checked on {hp.checked_on}</span>
            {hp.streak > 0 && <span className="font-mono text-warning">{hp.streak}d streak</span>}
          </div>
        </div>
      )
    }
    case 'prompt': {
      const pp = p as unknown as PromptPayload
      return (
        <div className="space-y-3">
          <div className="max-h-60 overflow-y-auto rounded border border-border/50 bg-surface-base p-3 font-mono text-[11px] leading-relaxed text-foreground scrollbar-hidden whitespace-pre-wrap">
            {pp.body}
          </div>
          {pp.tags && pp.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {pp.tags.map((t) => (
                <span key={t} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{t}</span>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'article_note': {
      const ap = p as unknown as ArticleNotePayload
      return (
        <div className="space-y-3">
          {ap.summary && <p className="text-xs leading-relaxed text-foreground">{ap.summary}</p>}
          {ap.key_claims.length > 0 && (
            <div>
              <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Key Claims</p>
              <ol className="space-y-1">
                {ap.key_claims.map((c, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="flex-shrink-0 font-mono text-[10px]">{i + 1}.</span>{c}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {ap.flashcards.length > 0 && (
            <p className="font-mono text-[10px] text-muted-foreground">{ap.flashcards.length} flashcard{ap.flashcards.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      )
    }
    default:
      return <pre className="text-xs text-muted-foreground">{JSON.stringify(resource.payload, null, 2)}</pre>
  }
}

/* ─── SavedList (generic, for all tools except article_note) ────────── */

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

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
  if (items.length === 0) return <p className="py-6 text-center text-xs text-muted-foreground">No saved items yet.</p>

  return (
    <>
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

/* ─── Prompt library launcher (simplified, for /resources/prompts) ─── */

function PromptLibraryLauncher({ onSave }: { onSave: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'prompt',
          title: title.trim(),
          payload: {
            body: body.trim(),
            category: 'general',
            tags: [] as string[],
          },
        }),
      })
      if (res.ok) {
        setTitle('')
        setBody('')
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onSave()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Try again.')
      }
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded border border-border bg-surface-secondary p-5">
      <div className="mb-4 flex items-center gap-2">
        <BookMarked className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Save a Prompt</h3>
      </div>
      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError(null) }}
          placeholder="Prompt title"
          className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); setError(null) }}
          placeholder="Paste or write your prompt…"
          rows={6}
          className="w-full resize-y rounded border border-border bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        {error && (
          <div className="flex items-start gap-2 rounded border border-[#ff4d4d]/30 bg-[#ff4d4d]/8 px-3 py-2 text-xs text-[#ff4d4d]">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || !body.trim()}
          className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/15 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <><Check className="h-4 w-4" /> Saved!</> : 'Save Prompt'}
        </button>
      </div>
      <p className="mt-3 font-mono text-[10px] text-muted-foreground">
        For the full prompt library experience with categories, tags, and editing, visit{' '}
        <Link href="/prompts" className="text-primary hover:underline">/prompts</Link>
      </p>
    </div>
  )
}

/* ─── Tool page component ──────────────────────────────── */

function ToolPageContent() {
  const params = useParams()
  const router = useRouter()
  const { status } = useSession()
  const slug = params?.slug as string ?? ''
  const resourceType = SLUG_MAP[slug]
  const meta = SLUG_LABELS[slug]
  const [saveKey, setSaveKey] = useState(0)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  if (!resourceType || !meta) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Tool not found.</p>
          <Link href="/resources" className="mt-2 inline-block text-xs text-primary hover:underline">Back to Resources</Link>
        </div>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const Icon = meta.icon as typeof BookOpen
  const handleSave = () => setSaveKey((k) => k + 1)

  return (
    <div className="min-h-screen bg-surface-base">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link
            href="/resources"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Resources
          </Link>
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{meta.name}</span>
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

      {/* Content */}
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        {/* Tool launcher */}
        {resourceType === 'flashcards'   && <FlashcardGenerator onClose={() => {}} mode="page" onSave={handleSave} />}
        {resourceType === 'grade_calc'   && <GradeCalculator    onClose={() => {}} mode="page" onSave={handleSave} />}
        {resourceType === 'workout'      && <WorkoutLoggerTool  onClose={() => {}} mode="page" onSave={handleSave} />}
        {resourceType === 'meal'         && <MealLogger         onClose={() => {}} mode="page" onSave={handleSave} />}
        {resourceType === 'repo_scan'    && <RepoScanner        onClose={() => {}} mode="page" onSave={handleSave} />}
        {resourceType === 'habit_streak' && <HabitStreaks       onClose={() => {}} mode="page" onSave={handleSave} />}
        {resourceType === 'article_note' && <ArticleNotes       onClose={() => {}} mode="page" onSave={handleSave} />}
        {resourceType === 'prompt'       && <PromptLibraryLauncher onSave={handleSave} />}

        {/* Saved items */}
        <div>
          {resourceType !== 'article_note' && (
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Saved</p>
            </div>
          )}
          {resourceType === 'article_note' ? (
            <ArticleNotesSavedList refreshKey={saveKey} onStudyAll={() => {}} />
          ) : (
            <SavedList type={resourceType} refreshKey={saveKey} />
          )}
        </div>
      </main>
    </div>
  )
}

export default function ToolPage() {
  return <ToolPageContent />
}
