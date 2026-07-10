import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import type { ResourceType } from '@/lib/resources'

export const maxDuration = 30

const WINDOW_DAYS = 30

// Friendly names for the "most active tool" callout.
const TOOL_LABELS: Partial<Record<ResourceType, string>> = {
  flashcards: 'Flashcards',
  grade_calc: 'Grade Calculator',
  workout: 'Workout Logger',
  meal: 'Meal Logger',
  repo_scan: 'Repo Scanner',
  habit_streak: 'Habit Streaks',
  race_pace: 'Race Pace',
  prompt: 'Prompt Library',
  article_note: 'Article Notes',
  repo_review: 'Repo Reviewer',
  countdown: 'Countdown',
  checkin: 'Daily Check-in',
  note: 'Quick Notes',
  bell_schedule: 'Bell Schedule',
  uploaded_file: 'File Upload',
}

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

// Convert a UTC instant to a YYYY-MM-DD key in the viewer's local day, given
// the client's getTimezoneOffset() (minutes to add to local to reach UTC).
function localDayKey(iso: string, offsetMin: number): string {
  const localMs = new Date(iso).getTime() - offsetMin * 60_000
  return new Date(localMs).toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const offsetMin = Number(searchParams.get('tzOffset') ?? '0') || 0

  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from('resources')
    .select('created_at, type')
    .eq('user_id', uid)                       // RLS scope
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[system/activity] query failed:', error)
    return Response.json({ error: 'Failed to load activity' }, { status: 500 })
  }

  const rows = (data ?? []) as { created_at: string; type: ResourceType }[]

  // Bucket by local day.
  const counts = new Map<string, number>()
  const typeCounts = new Map<ResourceType, number>()
  const activityDays = new Set<string>()
  for (const r of rows) {
    const day = localDayKey(r.created_at, offsetMin)
    counts.set(day, (counts.get(day) ?? 0) + 1)
    typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1)
    if (r.type === 'checkin' || r.type === 'habit_streak') activityDays.add(day)
  }

  // Continuous 30-day axis, zero-filled, ending today (viewer-local).
  const todayLocalMs = Date.now() - offsetMin * 60_000
  const daily: { day: string; count: number }[] = []
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const key = new Date(todayLocalMs - i * 86_400_000).toISOString().slice(0, 10)
    daily.push({ day: key, count: counts.get(key) ?? 0 })
  }

  // Saved this week (last 7 local days).
  const savedThisWeek = daily.slice(-7).reduce((sum, d) => sum + d.count, 0)

  // Most active tool over the window.
  let mostActiveTool: string | null = null
  let topCount = 0
  for (const [type, c] of typeCounts) {
    if (c > topCount) { topCount = c; mostActiveTool = TOOL_LABELS[type] ?? type }
  }

  // Consecutive-day streak from check-in / habit activity, ending today or
  // yesterday (viewer-local). 0 means no streak → UI skips the callout.
  let streak = 0
  const todayKey = new Date(todayLocalMs).toISOString().slice(0, 10)
  const yesterdayKey = new Date(todayLocalMs - 86_400_000).toISOString().slice(0, 10)
  let cursor: string | null = activityDays.has(todayKey)
    ? todayKey
    : activityDays.has(yesterdayKey) ? yesterdayKey : null
  while (cursor && activityDays.has(cursor)) {
    streak++
    cursor = new Date(new Date(cursor).getTime() - 86_400_000).toISOString().slice(0, 10)
  }

  const distinctActiveDays = daily.filter((d) => d.count > 0).length

  return Response.json({
    daily,
    savedThisWeek,
    mostActiveTool,
    streak,
    hasEnoughData: distinctActiveDays >= 3,
  })
}
