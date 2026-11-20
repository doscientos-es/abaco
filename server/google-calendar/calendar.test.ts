import { describe, expect, it, vi } from 'vitest'

import { GoogleCalendarClient } from './calendar'
import { projectVisitEvent } from './event'

const input = {
  tenantId: '5c000000-0000-4000-8000-000000000001',
  userId: '5c000000-0000-4000-8000-000000000002',
  visitId: '5c000000-0000-4000-8000-000000000003',
  start: new Date('2026-10-25T00:30:00Z'),
  end: new Date('2026-10-25T02:30:00Z'),
  timeZone: 'Europe/Madrid',
}
const marker = 'a'.repeat(64)
const projected = projectVisitEvent(input)
const remote = {
  ...projected,
  etag: '"version-1"',
  extendedProperties: { private: { abaco_marker: marker } },
}
function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Google Calendar server client', () => {
  it('creates a secondary calendar and inserts an allowlisted private event', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (typeof url !== 'string' || typeof init?.body !== 'string')
        throw new Error('Invalid request')
      if (url.endsWith('/calendars')) {
        expect(JSON.parse(init.body)).toEqual({ summary: 'Ábaco' })
        return json({ id: 'calendar-id' })
      }
      expect(url).toContain('/calendars/calendar-id/events?sendUpdates=none')
      expect(JSON.parse(init.body)).toEqual({
        ...projected,
        extendedProperties: { private: { abaco_marker: marker } },
      })
      return json(remote)
    })
    const client = new GoogleCalendarClient('access-test', fetcher)
    expect(await client.createSecondaryCalendar()).toBe('calendar-id')
    await expect(client.insertVisit('calendar-id', input, marker)).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('checks remote ownership and uses the returned ETag for updates and deletion', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === 'GET') return json(remote)
      expect(new Headers(init?.headers).get('If-Match')).toBe(remote.etag)
      if (init?.method === 'PATCH') return json(remote)
      return new Response(null, { status: 204 })
    })
    const client = new GoogleCalendarClient('access-test', fetcher)
    await client.updateVisit('calendar-id', input, marker)
    await client.deleteVisit('calendar-id', projected.id, marker)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('refuses to modify events with a different marker, missing version, or attendees', async () => {
    for (const unsafe of [
      { ...remote, extendedProperties: { private: { abaco_marker: 'b'.repeat(64) } } },
      { ...remote, etag: '' },
      { ...remote, attendees: [{ email: 'other@example.test' }] },
      { ...remote, status: 'cancelled' },
    ]) {
      const fetcher = vi.fn<typeof fetch>(async () => json(unsafe))
      const client = new GoogleCalendarClient('access-test', fetcher)
      await expect(client.updateVisit('calendar-id', input, marker)).rejects.toThrow('ownership')
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })

  it('does not claim success on conflict, incomplete response or an unconfirmed deletion', async () => {
    const conflict = vi.fn<typeof fetch>(async (_url, init) =>
      init?.method === 'GET' ? json(remote) : json({}, 412),
    )
    await expect(
      new GoogleCalendarClient('access-test', conflict).updateVisit('calendar-id', input, marker),
    ).rejects.toMatchObject({ status: 412 })
    const incomplete = vi.fn<typeof fetch>(async () => json({ id: projected.id }))
    await expect(
      new GoogleCalendarClient('access-test', incomplete).insertVisit('calendar-id', input, marker),
    ).rejects.toThrow('ownership')
    const wrongTime = vi.fn<typeof fetch>(async () =>
      json({ ...remote, start: { ...remote.start, dateTime: '2026-10-26T00:30:00Z' } }),
    )
    await expect(
      new GoogleCalendarClient('access-test', wrongTime).insertVisit('calendar-id', input, marker),
    ).rejects.toThrow('projection')
    const unconfirmedDelete = vi.fn<typeof fetch>(async (_url, init) =>
      init?.method === 'GET' ? json(remote) : json({}),
    )
    await expect(
      new GoogleCalendarClient('access-test', unconfirmedDelete).deleteVisit(
        'calendar-id',
        projected.id,
        marker,
      ),
    ).rejects.toThrow('not confirmed')
  })
})
