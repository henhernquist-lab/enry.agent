// Google Classroom API client — read-only, per-user.
// Each user connects via their own Google OAuth refresh token,
// stored encrypted in user_credentials (service='google_classroom').
// No env var fallback — every user provides their own token.
//
// Required shared env vars (for the OAuth client):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

import { google, classroom_v1 } from 'googleapis'
import { supabase } from '@/lib/supabase'
import { decrypt } from '@/lib/crypto'

// ── Credential lookup ───────────────────────────────────────────────────────

async function getRefreshToken(uid: string): Promise<string> {
  const { data } = await supabase
    .from('user_credentials')
    .select('credential_a')
    .eq('user_id', uid)
    .eq('service', 'google_classroom')
    .maybeSingle()

  if (!data?.credential_a) {
    throw new Error(
      'Google Classroom is not connected. Go to Settings → School to connect your Google account.',
    )
  }

  return decrypt(data.credential_a)
}

// ── Auth (per-user, no caching — tokens are per-uid) ────────────────────────

type AuthState = {
  auth: InstanceType<typeof google.auth.OAuth2>
  expiresAt: number
}

const _authCache = new Map<string, AuthState>()

async function getAuth(uid: string): Promise<InstanceType<typeof google.auth.OAuth2>> {
  const cached = _authCache.get(uid)
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.auth
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)')
  }

  const refreshToken = await getRefreshToken(uid)
  const auth = new google.auth.OAuth2(clientId, clientSecret)

  try {
    auth.setCredentials({ refresh_token: refreshToken })
    const { credentials } = await auth.refreshAccessToken()
    if (credentials.access_token) {
      auth.setCredentials(credentials)
      _authCache.set(uid, {
        auth,
        expiresAt: credentials.expiry_date ?? Date.now() + 3000_000,
      })
    }
  } catch (e) {
    console.error('[classroom] token refresh failed for uid:', uid, e)
    // Clear the bad token so the user sees a clear "reconnect" message
    _authCache.delete(uid)
    throw new Error(
      'Google Classroom token expired or was revoked. Reconnect in Settings → School.',
    )
  }

  return auth
}

// ── Client ──────────────────────────────────────────────────────────────────

async function client(uid: string): Promise<classroom_v1.Classroom> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return google.classroom({ version: 'v1', auth: await getAuth(uid) as any })
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

export async function listCourses(uid: string): Promise<{ courses: GCourse[]; error: string | null }> {
  try {
    const c = await client(uid)
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
  uid: string,
  courseId: string,
): Promise<{ work: GCourseWork[]; error: string | null }> {
  try {
    const c = await client(uid)
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
  uid: string,
  courseId: string,
  courseWorkId: string,
): Promise<{ submissions: GSubmission[]; error: string | null }> {
  try {
    const c = await client(uid)
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
  uid: string,
  courseId: string,
): Promise<{ announcements: GAnnouncement[]; error: string | null }> {
  try {
    const c = await client(uid)
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

// ── Convenience ─────────────────────────────────────────────────────────────

export async function getAllDueWork(uid: string): Promise<{
  courses: CourseWithWork[]
  error: string | null
}> {
  const { courses, error: coursesError } = await listCourses(uid)
  if (coursesError) return { courses: [], error: coursesError }

  const results: CourseWithWork[] = []
  for (const course of courses) {
    const { work, error: workError } = await listCourseWork(uid, course.id)
    if (workError) {
      console.error(`[classroom] failed to fetch work for ${course.name}:`, workError)
      results.push({ course, work: [] })
      continue
    }
    results.push({ course, work })
  }

  return { courses: results, error: null }
}

export async function getAllAnnouncements(uid: string): Promise<{
  courses: { course: GCourse; announcements: GAnnouncement[] }[]
  error: string | null
}> {
  const { courses, error: coursesError } = await listCourses(uid)
  if (coursesError) return { courses: [], error: coursesError }

  const results: { course: GCourse; announcements: GAnnouncement[] }[] = []
  for (const course of courses) {
    const { announcements, error: aError } = await listAnnouncements(uid, course.id)
    if (aError) {
      console.error(`[classroom] failed to fetch announcements for ${course.name}:`, aError)
      results.push({ course, announcements: [] })
      continue
    }
    results.push({ course, announcements })
  }

  return { courses: results, error: null }
}

// ── Connection check ────────────────────────────────────────────────────────

export async function hasClassroomConnection(uid: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_credentials')
    .select('credential_a')
    .eq('user_id', uid)
    .eq('service', 'google_classroom')
    .maybeSingle()
  return Boolean(data?.credential_a)
}
