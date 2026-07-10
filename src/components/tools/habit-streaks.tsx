'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Target, Plus, Trash2, Flame, Loader2, Check } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import { saveResource } from '@/lib/resources'

interface Habit { id: string; name: string; frequency: string; created_at: string }
interface HabitLog { id: string; habit_id: string; checked_on: string }

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function calculateStreak(logs: HabitLog[], habitId: string): number {
  const dates = logs
    .filter((l) => l.habit_id === habitId)
    .map((l) => l.checked_on)
    .sort()
    .reverse()

  let streak = 0
  let check = todayStr()

  for (const date of dates) {
    if (date === check) {
      streak++
      const d = new Date(check)
      d.setDate(d.getDate() - 1)
      check = d.toISOString().slice(0, 10)
    } else break
  }
  return streak
}

interface HabitStreaksProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

export function HabitStreaks({ onClose, mode = 'modal', onSave }: HabitStreaksProps) {
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [loading, setLoading] = useState(true)
  const [newHabit, setNewHabit] = useState('')
  const [adding, setAdding] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadAll = async () => {
    const [habitsRes, logsRes] = await Promise.all([
      fetch('/api/tools/habits').then((r) => r.json()),
      fetch('/api/tools/habit-logs').then((r) => r.json()),
    ])
    const newHabits: Habit[] = habitsRes.habits ?? []
    const newLogs: HabitLog[] = logsRes.logs ?? []
    setHabits(newHabits)
    setLogs(newLogs)
    setLoading(false)
    return { habits: newHabits, logs: newLogs }
  }

  useEffect(() => { loadAll() }, [])

  const today = todayStr()
  const checkedToday = new Set(logs.filter((l) => l.checked_on === today).map((l) => l.habit_id))

  const handleAddHabit = async () => {
    const name = newHabit.trim()
    if (!name) return
    setAdding(true)
    setError(null)
    try {
      await fetch('/api/tools/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      setNewHabit('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add habit')
    } finally {
      setAdding(false)
    }
  }

  const handleToggle = async (habitId: string) => {
    setToggling(habitId)
    setError(null)
    const habit = habits.find((h) => h.id === habitId)
    try {
      await fetch('/api/tools/habit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habit_id: habitId }),
      })
      const { logs: newLogs } = await loadAll()
      if (habit) {
        const streak = calculateStreak(newLogs, habitId)
        await saveResource('habit_streak', `${habit.name} — ${today}`, {
          habit_id: habitId,
          habit_name: habit.name,
          checked_on: today,
          streak,
        }).catch((e) => console.error('saveResource failed:', e))
        onSave?.()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle habit')
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      setError(null)
      const res = await fetch('/api/tools/habits', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete habit')
    }
  }

  const icon = <Target className="h-4 w-4 text-primary" />

  const body = loading ? (
    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  ) : (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={newHabit}
          onChange={(e) => { setNewHabit(e.target.value); setError(null) }}
          onKeyDown={(e) => e.key === 'Enter' && handleAddHabit()}
          placeholder="New habit (e.g. Read 20 pages)"
          className="flex-1 rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
        />
        <button
          onClick={handleAddHabit}
          disabled={adding || !newHabit.trim()}
          className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded border border-[#ff4d4d]/30 bg-[#ff4d4d]/8 px-3 py-2 text-xs text-[#ff4d4d]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {habits.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">No habits yet. Add one above to start tracking.</p>
      ) : (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Today — {today}</p>
          <AnimatePresence mode="popLayout">
            {habits.map((habit) => {
              const streak = calculateStreak(logs, habit.id)
              const done = checkedToday.has(habit.id)
              const isToggling = toggling === habit.id
              return (
                <motion.div key={habit.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`flex items-center gap-3 rounded border px-3 py-2.5 transition-colors ${done ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface-elevated'}`}>
                  <button
                    onClick={() => handleToggle(habit.id)}
                    disabled={isToggling}
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${done ? 'border-primary bg-primary text-surface-base' : 'border-border text-transparent hover:border-primary/50'}`}
                  >
                    {isToggling ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : <Check className="h-3 w-3" />}
                  </button>

                  <span className={`flex-1 text-sm ${done ? 'text-foreground' : 'text-muted-foreground'}`}>{habit.name}</span>

                  <div className="flex items-center gap-1.5">
                    {streak > 0 && (
                      <div className="flex items-center gap-1 font-mono text-xs text-warning">
                        <Flame className="h-3 w-3" />
                        {streak}d
                      </div>
                    )}
                    <button onClick={() => handleDelete(habit.id)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          <div className="mt-2 rounded border border-border bg-surface-elevated px-3 py-2 text-xs text-muted-foreground">
            {checkedToday.size} / {habits.length} habits done today
          </div>
        </div>
      )}
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel
        title="Habit Streaks"
        subtitle="Daily check-ins and streak tracking"
        icon={icon}
        onClose={onClose}
      >
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell
      title="Habit Streaks"
      subtitle="Daily check-ins and streak tracking"
      icon={icon}
      onClose={onClose}
    >
      {body}
    </ModalShell>
  )
}
