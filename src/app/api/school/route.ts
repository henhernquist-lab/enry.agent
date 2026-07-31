// Unified school data endpoint — merges Google Classroom + Infinite Campus
// into a single response. Read-only. Cached for 5 minutes in-memory.
//
// Query params:
//   ?mode=due          — upcoming assignments from both sources, sorted by due date
//   ?mode=announcements — recent announcements from both sources
//
// Response shape:
//   { items: UnifiedItem[], errors: string[] }
//   each item: { source: 'google_classroom' | 'infinite_campus', ... }

import { auth } from '@/lib/auth'
import { getAllDueWork, getAllAnnouncements, type GCourseWork } from '@/lib/classroom'
import {
  getAssignments,
  getAnnouncements as getICAnnouncements,
  type ICAssignment,
  type ICAnnouncement,
} from '@/lib/infinite-campus'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 60 // IC scraping can take a while

// ── Simple in-memory cache ──────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

let _dueCache: CacheEntry<UnifiedAssignment[]> | null = null
let _announcementsCache: CacheEntry<UnifiedAnnouncement[]> | null = null

// ── Unified types ───────────────────────────────────────────────────────────

export interface UnifiedAssignment {
  source: 'google_classroom' | 'infinite_campus'
  title: string
  course: string
  dueDate: string | null // ISO date string
  dueDateTs: number | null // Unix ms for sorting
  status: string | null
  points: number | null
  link: string | null
}

export interface UnifiedAnnouncement {
  source: 'google_classroom' | 'infinite_campus'
  course: string
  text: string
  date: string | null
  link: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseDueDate(
  item: GCourseWork | ICAssignment,
): { iso: string | null; ts: number | null } {
  // Google Classroom format: { year, month, day } object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gcItem = item as any
  if (gcItem.dueDate && typeof gcItem.dueDate.year === 'number') {
    const d = gcItem.dueDate as { year: number; month: number; day: number }
    const t = gcItem.dueTime as { hours?: number; minutes?: number } | undefined
    const date = new Date(
      d.year,
      (d.month ?? 1) - 1,
      d.day ?? 1,
      t?.hours ?? 0,
      t?.minutes ?? 0,
    )
    if (!isNaN(date.getTime())) return { iso: date.toISOString(), ts: date.getTime() }
    return { iso: null, ts: null }
  }

  // Infinite Campus format: string like "Jan 15, 2026" or "2026-01-15"
  const icItem = item as ICAssignment
  if (typeof icItem.dueDate === 'string' && icItem.dueDate) {
    const date = new Date(icItem.dueDate)
    if (!isNaN(date.getTime())) return { iso: date.toISOString(), ts: date.getTime() }
  }

  return { iso: null, ts: null }
}

// ── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchDueWork(uid: string): Promise<{
  assignments: UnifiedAssignment[]
  errors: string[]
}> {
  const assignments: UnifiedAssignment[] = []
  const errors: string[] = []

  // Google Classroom
  try {
    const { courses: gcCourses, error: gcError } = await getAllDueWork(uid)
    if (gcError) {
      errors.push(`Google Classroom: ${gcError}`)
    } else {
      for (const { course, work } of gcCourses) {
        for (const w of work) {
          const { iso, ts } = parseDueDate(w)
          assignments.push({
            source: 'google_classroom',
            title: w.title,
            course: course.name,
            dueDate: iso,
            dueDateTs: ts,
            status: w.state,
            points: w.maxPoints ?? null,
            link: w.alternateLink ?? null,
          })
        }
      }
    }
  } catch (e) {
    errors.push(`Google Classroom: ${String((e as Error)?.message ?? e)}`)
  }

  // Infinite Campus
  try {
    const { assignments: icAssignments, error: icError } = await getAssignments(uid)
    if (icError) {
      errors.push(`Infinite Campus: ${icError}`)
    } else {
      for (const a of icAssignments) {
        const { iso, ts } = parseDueDate(a)
        assignments.push({
          source: 'infinite_campus',
          title: a.name,
          course: a.course,
          dueDate: iso,
          dueDateTs: ts,
          status: a.status,
          points: a.totalPoints ? parseFloat(a.totalPoints) : null,
          link: null,
        })
      }
    }
  } catch (e) {
    errors.push(`Infinite Campus: ${String((e as Error)?.message ?? e)}`)
  }

  // Sort by due date (closest first, then items without a date at the end)
  assignments.sort((a, b) => {
    if (a.dueDateTs === null && b.dueDateTs === null) return 0
    if (a.dueDateTs === null) return 1
    if (b.dueDateTs === null) return -1
    return a.dueDateTs - b.dueDateTs
  })

  return { assignments, errors }
}

async function fetchAnnouncements(uid: string): Promise<{
  announcements: UnifiedAnnouncement[]
  errors: string[]
}> {
  const announcements: UnifiedAnnouncement[] = []
  const errors: string[] = []

  // Google Classroom
  try {
    const { courses: gcCourses, error: gcError } = await getAllAnnouncements(uid)
    if (gcError) {
      errors.push(`Google Classroom: ${gcError}`)
    } else {
      for (const { course, announcements: items } of gcCourses) {
        for (const a of items) {
          announcements.push({
            source: 'google_classroom',
            course: course.name,
            text: a.text,
            date: a.creationTime ?? null,
            link: a.alternateLink ?? null,
          })
        }
      }
    }
  } catch (e) {
    errors.push(`Google Classroom: ${String((e as Error)?.message ?? e)}`)
  }

  // Infinite Campus
  try {
    const { announcements: icItems, error: icError } = await getICAnnouncements(uid)
    if (icError) {
      errors.push(`Infinite Campus: ${icError}`)
    } else {
      for (const a of icItems) {
        announcements.push({
          source: 'infinite_campus',
          course: a.course,
          text: a.text,
          date: a.date,
          link: null,
        })
      }
    }
  } catch (e) {
    errors.push(`Infinite Campus: ${String((e as Error)?.message ?? e)}`)
  }

  // Sort by date (most recent first)
  announcements.sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  return { announcements, errors }
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(
    (session?.user as { id?: string } | undefined)?.id ?? null,
  )
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') ?? 'due'

  if (mode === 'due') {
    // Check cache
    if (_dueCache && Date.now() < _dueCache.expiresAt) {
      return Response.json({ items: _dueCache.data, cached: true })
    }

    const { assignments, errors } = await fetchDueWork(uid)
    _dueCache = { data: assignments, expiresAt: Date.now() + CACHE_TTL_MS }

    return Response.json({ items: assignments, errors: errors.length > 0 ? errors : undefined })
  }

  if (mode === 'announcements') {
    if (_announcementsCache && Date.now() < _announcementsCache.expiresAt) {
      return Response.json({ items: _announcementsCache.data, cached: true })
    }

    const { announcements, errors } = await fetchAnnouncements(uid)
    _announcementsCache = {
      data: announcements,
      expiresAt: Date.now() + CACHE_TTL_MS,
    }

    return Response.json({ items: announcements, errors: errors.length > 0 ? errors : undefined })
  }

  return Response.json({ error: `Unknown mode: ${mode}. Use ?mode=due or ?mode=announcements` }, { status: 400 })
}
