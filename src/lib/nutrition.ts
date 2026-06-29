export interface FoodEntry {
  id: string
  text: string
  calories: number
  protein: number
  carbs: number
  fat: number
  loggedAt: number
}

const STORAGE_KEY = 'enry_nutrition_log'
const MAX_ENTRIES = 1000
export const DAILY_PROTEIN_GOAL_G = 120

export function loadFoodEntries(): FoodEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveAll(all: FoodEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_ENTRIES)))
  } catch {}
}

export function logFood(text: string, macros: { calories: number; protein: number; carbs: number; fat: number }): FoodEntry {
  const entry: FoodEntry = {
    id: `food_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text,
    ...macros,
    loggedAt: Date.now(),
  }
  const all = loadFoodEntries()
  all.unshift(entry)
  saveAll(all)
  return entry
}

export function deleteFood(id: string): void {
  saveAll(loadFoodEntries().filter((f) => f.id !== id))
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export function todayEntries(entries: FoodEntry[]): FoodEntry[] {
  const today = dayKey(Date.now())
  return entries.filter((e) => dayKey(e.loggedAt) === today)
}

export function totals(entries: FoodEntry[]): { calories: number; protein: number; carbs: number; fat: number } {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}
