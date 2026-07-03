import { auth } from '@/lib/auth'
import { listEvents, createEvent } from '@/lib/calendar'

export const maxDuration = 30

type SessionWithToken = {
  accessToken?: string
  calendarError?: string
}

async function getToken(): Promise<{ accessToken: string | null; error: string | null }> {
  const session = await auth()
  if (!session) return { accessToken: null, error: 'Not authenticated' }

  const s = session as typeof session & SessionWithToken
  if (s.calendarError === 'no_refresh_token') {
    return {
      accessToken: null,
      error: 'Calendar access requires re-authentication. Please sign out and sign back in to grant Calendar permissions.',
    }
  }
  if (s.calendarError === 'refresh_failed') {
    return {
      accessToken: null,
      error: 'Your Google Calendar token could not be refreshed. Please sign out and sign back in.',
    }
  }
  if (!s.accessToken) {
    return {
      accessToken: null,
      error: 'No Calendar access token found. Please sign out and sign back in to grant Calendar permissions.',
    }
  }
  return { accessToken: s.accessToken, error: null }
}

// GET /api/calendar/events — fetch next 7 days
export async function GET() {
  const { accessToken, error } = await getToken()
  if (!accessToken) return Response.json({ error }, { status: 401 })

  const now = new Date()
  const sevenDaysOut = new Date(now.getTime() + 7 * 86400000)

  const { events, error: calError } = await listEvents(
    accessToken,
    now.toISOString(),
    sevenDaysOut.toISOString(),
  )

  if (calError) return Response.json({ error: calError }, { status: 502 })

  // Normalize to the shape the CalendarTool component expects
  const normalized = events.map((e) => ({
    id: e.id,
    title: e.summary,
    description: e.description,
    location: e.location,
    start_time: e.start.dateTime ?? e.start.date ?? '',
    end_time: e.end.dateTime ?? e.end.date ?? '',
    html_link: e.htmlLink,
    all_day: !e.start.dateTime,
  }))

  return Response.json({ events: normalized })
}

// POST /api/calendar/events — create an event
export async function POST(req: Request) {
  const { accessToken, error } = await getToken()
  if (!accessToken) return Response.json({ error }, { status: 401 })

  const body = await req.json()

  // Accept either the component's format or the Google Calendar format directly
  const summary = body.summary ?? body.title
  const description = body.description
  const location = body.location

  // Component sends start_time/end_time as ISO strings
  const startDateTime = body.start?.dateTime ?? body.start_time
  const endDateTime = body.end?.dateTime ?? body.end_time
  const timeZone = body.start?.timeZone ?? body.timezone ?? 'America/Chicago'

  if (!summary || !startDateTime || !endDateTime) {
    return Response.json({ error: 'Missing required fields: summary, start, end' }, { status: 400 })
  }

  const { event, error: calError } = await createEvent(accessToken, {
    summary,
    description,
    location,
    start: { dateTime: startDateTime, timeZone },
    end: { dateTime: endDateTime, timeZone },
  })

  if (calError) return Response.json({ error: calError }, { status: 502 })

  return Response.json({
    event: {
      id: event!.id,
      title: event!.summary,
      start_time: event!.start.dateTime ?? event!.start.date,
      end_time: event!.end.dateTime ?? event!.end.date,
      html_link: event!.htmlLink,
    },
  })
}

// DELETE /api/calendar/events — delete an event by id
export async function DELETE(req: Request) {
  const { accessToken, error } = await getToken()
  if (!accessToken) return Response.json({ error }, { status: 401 })

  const { id } = await req.json()
  if (!id) return Response.json({ error: 'Missing event id' }, { status: 400 })

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    // 204 = success, 404 = already gone — both are fine
    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => ({}))
      const msg = (data as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`
      return Response.json({ error: msg }, { status: 502 })
    }
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Network error' }, { status: 500 })
  }
}
