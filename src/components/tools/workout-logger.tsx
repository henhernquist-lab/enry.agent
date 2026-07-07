'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Dumbbell, Plus, Trash2, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import { saveResource } from '@/lib/resources'

interface SetEntry { reps: number; weight: number }
interface WorkoutRow { id: string; exercise: string; sets: SetEntry[]; logged_at: string }

function maxWeight(sets: SetEntry[]): number {
  return sets.reduce((m, s) => Math.max(m, s.weight), 0)
}

function isPlateaued(entries: WorkoutRow[], exercise: string): boolean {
  const ex = entries.filter((e) => e.exercise === exercise).slice(0, 3)
  if (ex.length < 3) return false
  const weights = ex.map((e) => maxWeight(e.sets))
  return weights[0] <= weights[1] && weights[1] <= weights[2]
}

function ProgressChart({ data }: { data: { x: number; y: number }[] }) {
  if (data.length < 2) return <p className="py-4 text-center text-xs text-muted-foreground">Log 2+ sessions to see a trend.</p>
  const W = 440; const H = 80; const P = 12
  const ys = data.map((d) => d.y)
  const min = Math.min(...ys); const max = Math.max(...ys); const range = max - min || 1
  const pts = data.map((d, i) => {
    const x = P + (i / (data.length - 1)) * (W - P * 2)
    const y = H - P - ((d.y - min) / range) * (H - P * 2)
    return `${x},${y}`
  })
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts.join(' ')} fill="none" stroke="var(--color-primary)" strokeWidth={2} />
      {pts.map((p, i) => {
        const [x, y] = p.split(',').map(Number)
        return <circle key={i} cx={x} cy={y} r={3} fill="var(--color-primary)" />
      })}
    </svg>
  )
}

interface WorkoutLoggerProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

export function WorkoutLoggerTool({ onClose, mode = 'modal', onSave }: WorkoutLoggerProps) {
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exercise, setExercise] = useState('')
  const [sets, setSets] = useState<SetEntry[]>([{ reps: 8, weight: 0 }])
  const [logging, setLogging] = useState(false)
  const [selectedEx, setSelectedEx] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => fetch('/api/tools/workouts').then((r) => r.json()).then((d) => { setWorkouts(d.workouts ?? []); setLoading(false) }).catch(() => { setError('Failed to load workouts'); setLoading(false) })
  useEffect(() => { load() }, [])

  const exercises = useMemo(() => [...new Set(workouts.map((w) => w.exercise))], [workouts])
  const activeEx = selectedEx ?? exercises[0] ?? null
  const exWorkouts = workouts.filter((w) => w.exercise === activeEx)
  const chartData = [...exWorkouts].reverse().map((w, i) => ({ x: i, y: maxWeight(w.sets) }))
  const plateaued = activeEx ? isPlateaued(workouts, activeEx) : false

  const handleLog = async () => {
    if (!exercise.trim()) return
    setLogging(true)
    setError(null)
    const exerciseName = exercise.trim()
    const currentSets = [...sets]
    const loggedAt = new Date().toISOString()
    try {
      const res = await fetch('/api/tools/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise: exerciseName, sets: currentSets }),
      })
      if (!res.ok) throw new Error(`Failed to log workout (${res.status})`)
      setExercise('')
      setSets([{ reps: 8, weight: 0 }])
      await load()
      await saveResource(
        'workout',
        `${exerciseName} — ${new Date().toLocaleDateString()}`,
        { exercise: exerciseName, sets: currentSets, logged_at: loggedAt },
      ).catch((e) => console.error('saveResource failed:', e))
      onSave?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log workout')
    } finally {
      setLogging(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      setError(null)
      const res = await fetch('/api/tools/workouts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workout')
    }
  }

  const icon = <Dumbbell className="h-4 w-4 text-primary" />

  const body = loading ? (
    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  ) : (
    <div className="space-y-4">
      <div className="rounded border border-border bg-surface-elevated p-3">
        <input
          value={exercise}
          onChange={(e) => { setExercise(e.target.value); setError(null) }}
          placeholder="Exercise name (e.g. Bench Press)"
          className="mb-2 w-full rounded border border-border bg-surface-base px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
        />
        <div className="space-y-1.5">
          {sets.map((set, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="number" value={set.reps} onChange={(e) => setSets((s) => s.map((x, j) => j === i ? { ...x, reps: Number(e.target.value) } : x))}
                className="w-16 rounded border border-border bg-surface-base px-2 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none" />
              <span className="text-xs text-muted-foreground">reps ×</span>
              <input type="number" value={set.weight} onChange={(e) => setSets((s) => s.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))}
                className="w-16 rounded border border-border bg-surface-base px-2 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none" />
              <span className="text-xs text-muted-foreground">lbs</span>
              {sets.length > 1 && (
                <button onClick={() => setSets((s) => s.filter((_, j) => j !== i))} className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => setSets((s) => [...s, { reps: 8, weight: 0 }])} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3 w-3" /> Add set
          </button>
          <button onClick={handleLog} disabled={!exercise.trim() || logging}
            className="ml-auto flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40">
            {logging && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Log workout
          </button>
        </div>

        {error && (
          <div className="mt-2 flex items-start gap-2 rounded border border-[#ff4d4d]/30 bg-[#ff4d4d]/8 px-3 py-2 text-xs text-[#ff4d4d]">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {exercises.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No workouts logged yet. Start tracking above.</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-accent" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Progress</span>
            </div>
            <select value={activeEx ?? ''} onChange={(e) => setSelectedEx(e.target.value)}
              className="rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-foreground">
              {exercises.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          {plateaued && (
            <div className="flex items-center gap-1.5 rounded border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Plateau detected — max weight hasn&apos;t increased in 3 sessions. Try varying reps or adding load.
            </div>
          )}

          <div className="rounded border border-border bg-surface-elevated p-2">
            <ProgressChart data={chartData} />
          </div>

          <AnimatePresence>
            {exWorkouts.slice(0, 5).map((w) => (
              <motion.div key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center justify-between rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5 text-xs">
                <span className="text-foreground">{w.sets.map((s) => `${s.reps}×${s.weight}`).join(', ')}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">max {maxWeight(w.sets)}lbs</span>
                  <button onClick={() => handleDelete(w.id)} className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </>
      )}
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel
        title="Workout Logger"
        subtitle="Track sets, reps, and weight over time"
        icon={icon}
        onClose={onClose}
      >
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell
      title="Workout Logger"
      subtitle="Track sets, reps, and weight over time"
      icon={icon}
      onClose={onClose}
      width="w-[560px]"
    >
      {body}
    </ModalShell>
  )
}
