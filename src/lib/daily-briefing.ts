export interface DailyBriefing {
  date: string // YYYY-MM-DD
  quote: string
  studyTip: string
  workoutReminder: string
  generatedAt: number
  dismissed: boolean
}

const STORAGE_KEY = 'enry_daily_briefing'

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function loadBriefing(): DailyBriefing | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: DailyBriefing = JSON.parse(raw)
    return parsed.date === todayKey() ? parsed : null
  } catch {
    return null
  }
}

export function saveBriefing(briefing: DailyBriefing): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(briefing))
  } catch {}
}

export function dismissBriefing(): void {
  const current = loadBriefing()
  if (!current) return
  saveBriefing({ ...current, dismissed: true })
}

export function parseBriefingText(text: string): { quote: string; studyTip: string; workoutReminder: string } {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean)
  return {
    quote: lines[0] ?? text.trim(),
    studyTip: lines[1] ?? '',
    workoutReminder: lines[2] ?? '',
  }
}
