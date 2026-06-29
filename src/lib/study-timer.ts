export interface StudySession {
  id: string
  subject: string
  durationMin: number
  startedAt: number
  completedAt: number | null
  quizQuestion: string | null
  quizAnswer: string | null
}

const STORAGE_KEY = 'enry_study_sessions'
const MAX_SESSIONS = 200

export function loadSessions(): StudySession[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveAll(all: StudySession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_SESSIONS)))
  } catch {}
}

export function startSession(subject: string, durationMin: number): StudySession {
  const session: StudySession = {
    id: `study_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    subject,
    durationMin,
    startedAt: Date.now(),
    completedAt: null,
    quizQuestion: null,
    quizAnswer: null,
  }
  const all = loadSessions()
  all.unshift(session)
  saveAll(all)
  return session
}

export function completeSession(id: string, quiz: { question: string; answer: string } | null): void {
  const all = loadSessions()
  const session = all.find((s) => s.id === id)
  if (!session) return
  session.completedAt = Date.now()
  if (quiz) {
    session.quizQuestion = quiz.question
    session.quizAnswer = quiz.answer
  }
  saveAll(all)
}

export function discardSession(id: string): void {
  saveAll(loadSessions().filter((s) => s.id !== id))
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export function calculateStreak(sessions: StudySession[]): number {
  const completedDays = new Set(
    sessions.filter((s) => s.completedAt).map((s) => dayKey(s.completedAt!)),
  )
  let streak = 0
  const cursor = new Date()
  while (completedDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
