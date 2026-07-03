'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dumbbell, Plus, Trash2, TrendingUp, AlertTriangle } from 'lucide-react'
import { ModalShell } from './modal-shell'
import {
  loadWorkouts,
  logWorkout,
  deleteWorkout,
  exerciseNames,
  progressForExercise,
  isPlateaued,
  maxWeight,
  type WorkoutEntry,
  type SetEntry,
} from '@/lib/workout-log'

function ProgressChart({ data }: { data: { loggedAt: number; maxWeight: number }[] }) {
  if (data.length < 2) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Log at least 2 sessions to see a trend.</p>
  }
  const width = 440
  const height = 120
  const padding = 16
  const weights = data.map((d) => d.maxWeight)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const range = max - min || 1

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2)
    const y = height - padding - ((d.maxWeight - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={points.join(' ')} fill="none" stroke="var(--color-primary)" strokeWidth={2} />
      {points.map((p, i) => {
        const [x, y] = p.split(',').map(Number)
        return <circle key={i} cx={x} cy={y} r={3} fill="var(--color-primary)" />
      })}
    </svg>
  )
}

export function WorkoutLoggerPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<WorkoutEntry[]>(() => loadWorkouts())
  const [exercise, setExercise] = useState('')
  const [sets, setSets] = useState<SetEntry[]>([{ reps: 8, weight: 0 }])
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const refresh = () => setEntries(loadWorkouts())

  const names = useMemo(() => exerciseNames(entries), [entries])
  const activeExercise = selectedExercise ?? names[0] ?? null
  const progress = activeExercise ? progressForExercise(entries, activeExercise) : []
  const plateaued = activeExercise ? isPlateaued(entries, activeExercise) : false

  const handleAddSetRow = () => setSets((s) => [...s, { reps: 8, weight: 0 }])
  const handleSetChange = (index: number, field: keyof SetEntry, value: number) => {
    setSets((s) => s.map((set, i) => (i === index ? { ...set, [field]: value } : set)))
  }
  const handleRemoveSetRow = (index: number) => setSets((s) => s.filter((_, i) => i !== index))

  const handleLog = () => {
    if (!exercise.trim()) return
    logWorkout(exercise.trim(), sets)
    setExercise('')
    setSets([{ reps: 8, weight: 0 }])
    refresh()
  }

  const recentForExercise = entries.filter((e) => e.exercise === activeExercise).slice(0, 5)

  return (
    <ModalShell title="Workout Logger" subtitle="Track sets, reps, and weight over time" icon={<Dumbbell className="h-4 w-4 text-primary" />} onClose={onClose} width="w-[560px]">
      <div className="mb-4 rounded border border-border bg-surface-elevated p-3">
        <input
          type="text"
          value={exercise}
          onChange={(e) => setExercise(e.target.value)}
          placeholder="Exercise (e.g. Bench Press)"
          className="mb-2 w-full rounded border border-border bg-surface-base px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <div className="space-y-1.5">
          {sets.map((set, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="number"
                value={set.reps}
                onChange={(e) => handleSetChange(i, 'reps', Number(e.target.value))}
                placeholder="Reps"
                className="w-20 rounded border border-border bg-surface-base px-2 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">reps ×</span>
              <input
                type="number"
                value={set.weight}
                onChange={(e) => handleSetChange(i, 'weight', Number(e.target.value))}
                placeholder="Weight"
                className="w-20 rounded border border-border bg-surface-base px-2 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">lbs</span>
              {sets.length > 1 && (
                <button onClick={() => handleRemoveSetRow(i)} className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={handleAddSetRow} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3 w-3" />
            Add set
          </button>
          <button
            onClick={handleLog}
            disabled={!exercise.trim()}
            className="ml-auto rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Log workout
          </button>
        </div>
      </div>

      {names.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No workouts logged yet. Start tracking above.</p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-accent" />
              <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Progress</h4>
            </div>
            <select
              value={activeExercise ?? ''}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-foreground"
            >
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {plateaued && (
            <div className="mb-2 flex items-center gap-1.5 rounded border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Plateau detected — max weight hasn&apos;t increased in your last 3 sessions. Consider varying reps or adding load.
            </div>
          )}

          <div className="mb-3 rounded border border-border bg-surface-elevated p-2">
            <ProgressChart data={progress} />
          </div>

          <div className="space-y-1.5">
            {recentForExercise.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5 text-xs">
                <span className="text-foreground">
                  {entry.sets.map((s) => `${s.reps}×${s.weight}`).join(', ')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">max {maxWeight(entry.sets)}lbs</span>
                  <button
                    onClick={() => {
                      deleteWorkout(entry.id)
                      refresh()
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </ModalShell>
  )
}
