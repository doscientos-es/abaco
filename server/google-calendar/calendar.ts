import { projectVisitEvent } from './event'

type EventInput = Parameters<typeof projectVisitEvent>[0]
const markerPattern = /^[0-9a-f]{64}$/
const apiBase = 'https://www.googleapis.com/calendar/v3'

/** Contains only the status, never Google's response body or credentials. */
export class CalendarRequestError extends Error {
  constructor(readonly status: number) {
    super('Google Calendar request failed')
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function eventPath(calendarId: string, eventId: string) {
  if (
    !calendarId ||
    calendarId.toLowerCase() === 'primary' ||
    calendarId.length > 1024 ||
    !/^[0-9a-v]{5,1024}$/.test(eventId)
  )
    throw new Error('Invalid calendar event identity')
  return `${apiBase}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
}

function assertMarker(marker: string) {
  if (!markerPattern.test(marker)) throw new Error('Invalid event ownership marker')
}

function assertOwnedEvent(value: unknown, eventId: string, marker: string) {
  const event = record(value)
  const privateProperties = record(record(event.extendedProperties).private)
  if (
    event.id !== eventId ||
    event.status === 'cancelled' ||
    privateProperties.abaco_marker !== marker ||
    typeof event.etag !== 'string' ||
    !event.etag ||
    (event.attendees !== undefined &&
      (!Array.isArray(event.attendees) || event.attendees.length > 0))
  )
    throw new Error('Calendar event ownership or version cannot be verified')
  return event.etag
}

function assertProjection(
  value: unknown,
  expected: ReturnType<typeof projectVisitEvent>,
  marker: string,
) {
  assertOwnedEvent(value, expected.id, marker)
  const event = record(value)
  const start = record(event.start)
  const end = record(event.end)
  if (
    event.summary !== expected.summary ||
    event.visibility !== expected.visibility ||
    typeof start.dateTime !== 'string' ||
    typeof end.dateTime !== 'string' ||
    Date.parse(start.dateTime) !== Date.parse(expected.start.dateTime) ||
    Date.parse(end.dateTime) !== Date.parse(expected.end.dateTime) ||
    start.timeZone !== expected.start.timeZone ||
    end.timeZone !== expected.end.timeZone
  )
    throw new Error('Calendar event projection not confirmed')
}

/** Low-level provider operations; caller must enforce assignment and durable serialization. */
export class GoogleCalendarClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!accessToken) throw new Error('Missing Google access token')
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    let response: Response
    try {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${this.accessToken}`)
      response = await this.fetcher(url, { ...init, headers })
    } catch {
      throw new Error('Google Calendar request unavailable')
    }
    if (!response.ok) throw new CalendarRequestError(response.status)
    if (init.method === 'DELETE' && response.status !== 204)
      throw new Error('Calendar deletion not confirmed')
    if (response.status === 204) return null
    return response.json().catch(() => {
      throw new Error('Invalid Google Calendar response')
    })
  }

  /** Non-idempotent: a lost response must be reconciled, never blindly retried. */
  async createSecondaryCalendar() {
    const result = record(
      await this.request(`${apiBase}/calendars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: 'Ábaco' }),
      }),
    )
    if (typeof result.id !== 'string' || !result.id) throw new Error('Invalid calendar response')
    return result.id
  }

  /** Marker must be random, persisted before the first attempt and specific to this mapping. */
  async insertVisit(calendarId: string, input: EventInput, marker: string) {
    assertMarker(marker)
    const event = projectVisitEvent(input)
    const path = eventPath(calendarId, event.id)
    const result = await this.request(path.slice(0, path.lastIndexOf('/')) + '?sendUpdates=none', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...event, extendedProperties: { private: { abaco_marker: marker } } }),
    })
    assertProjection(result, event, marker)
  }

  private async ownedVersion(calendarId: string, eventId: string, marker: string) {
    assertMarker(marker)
    const result = await this.request(eventPath(calendarId, eventId), { method: 'GET' })
    return assertOwnedEvent(result, eventId, marker)
  }

  async updateVisit(calendarId: string, input: EventInput, marker: string) {
    const event = projectVisitEvent(input)
    const etag = await this.ownedVersion(calendarId, event.id, marker)
    const { id, ...fields } = event
    const result = await this.request(`${eventPath(calendarId, id)}?sendUpdates=none`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify(fields),
    })
    assertProjection(result, event, marker)
  }

  async deleteVisit(calendarId: string, eventId: string, marker: string) {
    const etag = await this.ownedVersion(calendarId, eventId, marker)
    await this.request(`${eventPath(calendarId, eventId)}?sendUpdates=none`, {
      method: 'DELETE',
      headers: { 'If-Match': etag },
    })
  }
}
