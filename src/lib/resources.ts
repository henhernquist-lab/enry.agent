export type ResourceType = 'flashcards' | 'grade_calc' | 'workout' | 'meal' | 'repo_scan' | 'habit_streak'

export interface Resource<T = unknown> {
  id: string
  google_id: string
  type: ResourceType
  title: string
  payload: T
  created_at: string
  updated_at: string
}

export interface FlashcardsPayload {
  notes: string
  cards: { question: string; answer: string }[]
}

export interface GradeCalcPayload {
  targetGpa: string
  classes: { id: string; name: string; currentGrade: number; finalWeight: number; credits: number }[]
  weightedGpa: number
}

export interface WorkoutPayload {
  exercise: string
  sets: { reps: number; weight: number }[]
  logged_at: string
}

export interface MealPayload {
  description: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface RepoScanPayload {
  name: string
  description: string
  stars: number
  language: string
  topics: string[]
  readme: string
  fileTree: string[]
}

export interface HabitStreakPayload {
  habit_id: string
  habit_name: string
  checked_on: string
  streak: number
}

export async function saveResource(
  type: ResourceType,
  title: string,
  payload: unknown,
): Promise<void> {
  fetch('/api/resources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, title, payload }),
  }).catch((e) => console.error('[resources] save failed:', e))
}

export async function loadResources(type: ResourceType): Promise<Resource[]> {
  try {
    const res = await fetch(`/api/resources?type=${type}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.resources ?? []
  } catch {
    return []
  }
}

export async function deleteResource(id: string): Promise<void> {
  await fetch(`/api/resources/${id}`, { method: 'DELETE' })
}

export function resourceSummary(resource: Resource): string {
  const p = resource.payload as Record<string, unknown>
  switch (resource.type) {
    case 'flashcards': {
      const cards = (p.cards as unknown[]) ?? []
      return `${cards.length} card${cards.length !== 1 ? 's' : ''}`
    }
    case 'grade_calc': {
      const gpa = typeof p.weightedGpa === 'number' ? p.weightedGpa.toFixed(2) : '—'
      return `GPA ${gpa} · target ${p.targetGpa}`
    }
    case 'workout': {
      const sets = (p.sets as { reps: number; weight: number }[]) ?? []
      const max = sets.reduce((m, s) => Math.max(m, s.weight), 0)
      return `${sets.length} set${sets.length !== 1 ? 's' : ''} · ${max}lbs max`
    }
    case 'meal': {
      return `${p.calories}cal · ${p.protein}g protein`
    }
    case 'repo_scan': {
      const files = (p.fileTree as unknown[]) ?? []
      return `${p.language || 'unknown'} · ${p.stars} ★ · ${files.length} files`
    }
    case 'habit_streak': {
      const streak = typeof p.streak === 'number' ? p.streak : 0
      return streak > 0 ? `${streak}d streak` : 'checked in'
    }
    default:
      return ''
  }
}
