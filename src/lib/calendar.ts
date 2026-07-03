const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  htmlLink?: string
}

export interface NewEventInput {
  summary: string
  description?: string
  location?: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
}

async function calendarFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<{ data: unknown; error: string | null }> {
  try {
    const res = await fetch(`${CALENDAR_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    })
    const data = await res.json()
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`
      return { data: null, error: msg }
    }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function listEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<{ events: CalendarEvent[]; error: string | null }> {
  const params = new URLSearchParams({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  })

  const { data, error } = await calendarFetch(
    `/calendars/primary/events?${params}`,
    accessToken,
  )

  if (error) return { events: [], error }

  const items = (data as { items?: CalendarEvent[] })?.items ?? []
  return { events: items, error: null }
}

export async function createEvent(
  accessToken: string,
  event: NewEventInput,
): Promise<{ event: CalendarEvent | null; error: string | null }> {
  const { data, error } = await calendarFetch('/calendars/primary/events', accessToken, {
    method: 'POST',
    body: JSON.stringify(event),
  })

  if (error) return { event: null, error }
  return { event: data as CalendarEvent, error: null }
}
