export interface SetEntry {
  reps: number
  weight: number
}

export interface WorkoutEntry {
  id: string
  exercise: string
  sets: SetEntry[]
  loggedAt: number
}

const STORAGE_KEY = 'enry_workout_log'
const MAX_ENTRIES = 500

export function loadWorkouts(): WorkoutEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveAll(all: WorkoutEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_ENTRIES)))
  } catch {}
}

export function logWorkout(exercise: string, sets: SetEntry[]): WorkoutEntry {
  const entry: WorkoutEntry = {
    id: `workout_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    exercise,
    sets,
    loggedAt: Date.now(),
  }
  const all = loadWorkouts()
  all.unshift(entry)
  saveAll(all)
  return entry
}

export function deleteWorkout(id: string): void {
  saveAll(loadWorkouts().filter((w) => w.id !== id))
}

export function maxWeight(sets: SetEntry[]): number {
  return sets.reduce((max, s) => Math.max(max, s.weight), 0)
}

export function exerciseNames(entries: WorkoutEntry[]): string[] {
  return Array.from(new Set(entries.map((e) => e.exercise))).sort()
}

export function progressForExercise(
  entries: WorkoutEntry[],
  exercise: string,
): { loggedAt: number; maxWeight: number }[] {
  return entries
    .filter((e) => e.exercise === exercise)
    .map((e) => ({ loggedAt: e.loggedAt, maxWeight: maxWeight(e.sets) }))
    .sort((a, b) => a.loggedAt - b.loggedAt)
}

/** Flags a plateau when the last 3+ sessions for an exercise show no increase in max weight. */
export function isPlateaued(entries: WorkoutEntry[], exercise: string): boolean {
  const progress = progressForExercise(entries, exercise)
  if (progress.length < 3) return false
  const recent = progress.slice(-3)
  return recent.every((p) => p.maxWeight <= recent[0].maxWeight)
}
