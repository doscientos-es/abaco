export type PortalVisit = {
  startsAt: string
  endsAt: string
  timezone: string
  status: 'scheduled' | 'in_progress'
}

export type PortalDocument = {
  closedAt: string
  version: number
  checksTotal: number
  checksDone: number
}

export type PortalContent = { visits: PortalVisit[]; documents: PortalDocument[] }
export type PortalSnapshot = PortalContent & { expiresAt: string }

export const portalPath = '/portal-cliente'
export const portalApi = '/api/customer_portal'
export const portalTokenPattern = /^[a-f0-9]{64}$/
export const portalVisitLimit = 20
export const portalDocumentLimit = 10

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function date(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function decodePortalVisit(value: unknown): PortalVisit | null {
  const { startsAt, endsAt, timezone, status } = record(value)
  if (
    !date(startsAt) ||
    !date(endsAt) ||
    Date.parse(endsAt) <= Date.parse(startsAt) ||
    typeof timezone !== 'string' ||
    (status !== 'scheduled' && status !== 'in_progress')
  )
    return null
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: timezone })
  } catch {
    return null
  }
  return { startsAt, endsAt, timezone, status }
}

function whole(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function decodePortalDocument(value: unknown): PortalDocument | null {
  const { closedAt, version, checksTotal, checksDone } = record(value)
  if (
    !date(closedAt) ||
    !whole(version) ||
    version < 1 ||
    !whole(checksTotal) ||
    !whole(checksDone) ||
    checksDone > checksTotal
  )
    return null
  return { closedAt, version, checksTotal, checksDone }
}

export function decodePortalSnapshot(value: unknown): PortalSnapshot | null {
  const { expiresAt, visits, documents } = record(value)
  if (
    !date(expiresAt) ||
    !Array.isArray(visits) ||
    !Array.isArray(documents) ||
    visits.length > portalVisitLimit ||
    documents.length > portalDocumentLimit
  )
    return null
  const publicVisits = visits.map(decodePortalVisit)
  const publicDocuments = documents.map(decodePortalDocument)
  if (publicVisits.some((item) => !item) || publicDocuments.some((item) => !item)) return null
  return {
    expiresAt,
    visits: publicVisits.filter((item) => item !== null),
    documents: publicDocuments.filter((item) => item !== null),
  }
}
