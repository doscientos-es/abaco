import { createHash } from 'node:crypto'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const timeZoneName = /^(?:UTC|[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)+)$/

type VisitEventInput = {
  tenantId: string
  userId: string
  visitId: string
  start: Date
  end: Date
  timeZone: string
}

/** Local projection only. The caller must independently authorize the current assignment. */
export function projectVisitEvent(input: VisitEventInput) {
  const ids = [input.tenantId, input.userId, input.visitId]
  if (!ids.every((id) => uuid.test(id))) throw new Error('Invalid event identity')
  if (
    !(input.start instanceof Date) ||
    !(input.end instanceof Date) ||
    !Number.isFinite(input.start.getTime()) ||
    !Number.isFinite(input.end.getTime()) ||
    input.end.getTime() <= input.start.getTime()
  )
    throw new Error('Invalid event time range')
  if (!timeZoneName.test(input.timeZone)) throw new Error('Invalid event time zone')
  try {
    new Intl.DateTimeFormat('en', { timeZone: input.timeZone })
  } catch {
    throw new Error('Invalid event time zone')
  }

  // Hex is a subset of Google's base32hex event-ID alphabet. This is not an
  // authorization check or proof that a remote event belongs to this app.
  const digest = createHash('sha256')
    .update(`abaco-visit-v1:${ids.map((id) => id.toLowerCase()).join(':')}`)
    .digest('hex')
  return {
    id: `a${digest}`,
    summary: 'Visita Ábaco',
    visibility: 'private' as const,
    start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
  }
}
