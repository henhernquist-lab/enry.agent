import type { ResourceSource } from './resource-source'

export type ResourceType = 'flashcards' | 'grade_calc' | 'workout' | 'meal' | 'repo_scan' | 'habit_streak' | 'race_pace' | 'prompt' | 'article_note'

export interface Resource<T = unknown> {
  id: string
  user_id: string
  type: ResourceType
  source: ResourceSource
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

export interface PromptPayload {
  body: string
  category: 'coding' | 'writing' | 'study' | 'training' | 'general'
  tags: string[]
  notes?: string
  use_count?: number
  last_used_at?: string
}

export interface ArticleNotePayload {
  url: string
  canonical_url?: string
  source_domain: string
  article_title: string
  author?: string
  published_at?: string
  fetched_at: string
  raw_text_length: number
  summary: string
  key_claims: string[]
  flashcards: { q: string; a: string }[]
  tags: string[]
  user_note?: string
  processing_failed?: boolean
}

export interface RacePacePayload {
  mode: 'calculation' | 'result'
  distance: string
  distance_meters: number
  time_seconds: number
  splits?: number[]
  strategy?: 'even' | 'negative' | 'race_model'
  date?: string
  notes?: string
  is_pr?: boolean
  meet?: string
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

export async function loadResources(type: ResourceType, source?: ResourceSource): Promise<Resource[]> {
  try {
    const qs = source ? `&source=${source}` : ''
    const res = await fetch(`/api/resources?type=${type}${qs}`)
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

function fmtSecsShort(s: number): string {
  if (s < 60) return s.toFixed(2)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`
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
    case 'race_pace': {
      const rp = p as unknown as RacePacePayload
      const t = fmtSecsShort(rp.time_seconds)
      return rp.mode === 'result'
        ? `${rp.distance} ${t}${rp.is_pr ? ' · PR' : ''}`
        : `${rp.distance} goal ${t}`
    }
    case 'article_note': {
      const an = p as unknown as ArticleNotePayload
      const fc = (an.flashcards ?? []).length
      return `${an.source_domain} · ${fc} card${fc !== 1 ? 's' : ''}`
    }
    default:
      return ''
  }
}
