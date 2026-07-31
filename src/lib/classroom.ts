// Google Classroom API client — read-only, single-user (Henry's account).
// Uses OAuth 2.0 with a stored refresh token (GOOGLE_REFRESH_TOKEN) so
// no browser consent flow is needed at runtime — the token was obtained
// once via a one-time OAuth flow and Golem refreshes it automatically.
//
// Required env vars:
//   GOOGLE_CLIENT_ID      — from GCP console → APIs & Services → Credentials
//   GOOGLE_CLIENT_SECRET  — same place
//   GOOGLE_REFRESH_TOKEN  — obtained once via OAuth playground or CLI flow

import { google, classroom_v1 } from 'googleapis'

// ── Auth ────────────────────────────────────────────────────────────────────

let _auth: InstanceType<typeof google.auth.OAuth2> | null = null
let _tokenExpiresAt = 0

function getAuth(): InstanceType<typeof google.auth.OAuth2> {
  if (_auth) return _auth
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Google Classroom is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in env vars.',
    )
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  _auth = auth
  return auth
}

async function ensureFreshToken(): Promise<string> {
  const auth = getAuth()
  // Refresh proactively if the current token expires within 60 seconds.
  if (Date.now() > _tokenExpiresAt - 60_000) {
    try {
      const { credentials } = await auth.refreshAccessToken()
      if (credentials.access_token) {
        auth.setCredentials(credentials)
        if (credentials.expiry_date) _tokenExpiresAt = credentials.expiry_date
      }
    } catch (e) {
      console.error('[classroom] token refresh failed:', e)
      throw new Error(
        'Failed to refresh Google Classroom access token. Check that GOOGLE_REFRESH_TOKEN is still valid.',
      )
    }
  }
  const token = await auth.getAccessToken()
  if (!token.token) throw new Error('No access token available for Google Classroom')
  return token.token
}

// ── Client ──────────────────────────────────────────────────────────────────

async function classroom(): Promise<classroom_v1.Classroom> {
  await ensureFreshToken()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return google.classroom({ version: 'v1', auth: getAuth() as any })
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface GCourse {
  id: string
  name: string
  section?: string
  descriptionHeading?: string
  enrollmentCode?: string
}

export interface GCourseWork {
  id: string
  title: string
  description?: string
  dueDate?: { year: number; month: number; day: number }
  dueTime?: { hours: number; minutes: number }
  maxPoints?: number
  workType?: string
  state: string
  alternateLink?: string
  creationTime?: string
}

export interface GSubmission {
  id: string
  courseWorkId: string
  state: string
  assignedGrade?: number
  late?: boolean
  alternateLink?: string
}

export interface GAnnouncement {
  id: string
  text: string
  state: string
  alternateLink?: string
  creationTime?: string
  updateTime?: string
}

export interface CourseWithWork {
  course: GCourse
  work: GCourseWork[]
}

// ── API calls ───────────────────────────────────────────────────────────────

export async function listCourses(): Promise<{ courses: GCourse[]; error: string | null }> {
  try {
    const c = await classroom()
    const res = await c.courses.list({ courseStates: ['ACTIVE'], pageSize: 50 })
    const courses: GCourse[] = (res.data.courses ?? []).map((co) => ({
      id: co.id!,
      name: co.name!,
      section: co.section ?? undefined,
      descriptionHeading: co.descriptionHeading ?? undefined,
      enrollmentCode: co.enrollmentCode ?? undefined,
    }))
    return { courses, error: null }
  } catch (e) {
    return { courses: [], error: String((e as Error)?.message ?? e) }
  }
}

export async function listCourseWork(
  courseId: string,
): Promise<{ work: GCourseWork[]; error: string | null }> {
  try {
    const c = await classroom()
    const res = await c.courses.courseWork.list({
      courseId,
      pageSize: 50,
      orderBy: 'dueDate desc',
    })
    const work: GCourseWork[] = (res.data.courseWork ?? []).map((w) => ({
      id: w.id!,
      title: w.title!,
      description: w.description ?? undefined,
      dueDate: w.dueDate
        ? { year: w.dueDate.year!, month: w.dueDate.month!, day: w.dueDate.day! }
        : undefined,
      dueTime: w.dueTime
        ? { hours: w.dueTime.hours ?? 0, minutes: w.dueTime.minutes ?? 0 }
        : undefined,
      maxPoints: w.maxPoints ?? undefined,
      workType: w.workType ?? undefined,
      state: w.state ?? 'PUBLISHED',
      alternateLink: w.alternateLink ?? undefined,
      creationTime: w.creationTime ?? undefined,
    }))
    return { work, error: null }
  } catch (e) {
    return { work: [], error: String((e as Error)?.message ?? e) }
  }
}

export async function listStudentSubmissions(
  courseId: string,
  courseWorkId: string,
): Promise<{ submissions: GSubmission[]; error: string | null }> {
  try {
    const c = await classroom()
    const res = await c.courses.courseWork.studentSubmissions.list({
      courseId,
      courseWorkId,
      pageSize: 50,
    })
    const subs: GSubmission[] = (res.data.studentSubmissions ?? []).map((s) => ({
      id: s.id!,
      courseWorkId: s.courseWorkId!,
      state: s.state ?? 'NEW',
      assignedGrade: s.assignedGrade ?? undefined,
      late: s.late ?? undefined,
      alternateLink: s.alternateLink ?? undefined,
    }))
    return { submissions: subs, error: null }
  } catch (e) {
    return { submissions: [], error: String((e as Error)?.message ?? e) }
  }
}

export async function listAnnouncements(
  courseId: string,
): Promise<{ announcements: GAnnouncement[]; error: string | null }> {
  try {
    const c = await classroom()
    const res = await c.courses.announcements.list({
      courseId,
      pageSize: 20,
      orderBy: 'updateTime desc',
    })
    const announcements: GAnnouncement[] = (res.data.announcements ?? []).map((a) => ({
      id: a.id!,
      text: a.text ?? '',
      state: a.state ?? 'PUBLISHED',
      alternateLink: a.alternateLink ?? undefined,
      creationTime: a.creationTime ?? undefined,
      updateTime: a.updateTime ?? undefined,
    }))
    return { announcements, error: null }
  } catch (e) {
    return { announcements: [], error: String((e as Error)?.message ?? e) }
  }
}

// ── Convenience: fetch all coursework across all courses ─────────────────────

export async function getAllDueWork(): Promise<{
  courses: CourseWithWork[]
  error: string | null
}> {
  const { courses, error: coursesError } = await listCourses()
  if (coursesError) return { courses: [], error: coursesError }

  const results: CourseWithWork[] = []
  for (const course of courses) {
    const { work, error: workError } = await listCourseWork(course.id)
    if (workError) {
      console.error(`[classroom] failed to fetch work for ${course.name}:`, workError)
      results.push({ course, work: [] })
      continue
    }
    results.push({ course, work })
  }

  return { courses: results, error: null }
}

export async function getAllAnnouncements(): Promise<{
  courses: { course: GCourse; announcements: GAnnouncement[] }[]
  error: string | null
}> {
  const { courses, error: coursesError } = await listCourses()
  if (coursesError) return { courses: [], error: coursesError }

  const results: { course: GCourse; announcements: GAnnouncement[] }[] = []
  for (const course of courses) {
    const { announcements, error: aError } = await listAnnouncements(course.id)
    if (aError) {
      console.error(`[classroom] failed to fetch announcements for ${course.name}:`, aError)
      results.push({ course, announcements: [] })
      continue
    }
    results.push({ course, announcements })
  }

  return { courses: results, error: null }
}
