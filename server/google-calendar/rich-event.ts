export type VisitCalendarDetails = {
  tenantId: string
  visitId: string
  start: Date
  timeZone: string
  appUrl: string
  title: string
  clientName: string
  locationName: string
  address: string
  postalCode: string
  city: string
  notes: string
  assignees: string[]
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  )
}

/** Only call after checking the connection's consent and the effective visit assignment. */
export function projectVisitCalendarDetails(details: VisitCalendarDetails) {
  if (!uuid.test(details.tenantId) || !uuid.test(details.visitId))
    throw new Error('Invalid visit identity')
  const origin = new URL(details.appUrl)
  if (origin.protocol !== 'https:' || origin.username || origin.password)
    throw new Error('Invalid application URL')
  if (!Number.isFinite(details.start.getTime())) throw new Error('Invalid visit time')
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone: details.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(details.start)
  const link = new URL('/mi-jornada', origin.origin)
  link.search = new URLSearchParams({
    empresa: details.tenantId,
    visita: details.visitId,
    fecha: date,
  }).toString()
  const title = [details.title.trim(), details.clientName.trim()].filter(Boolean).join(' · ')
  const location = [
    details.locationName.trim(),
    details.address.trim(),
    [details.postalCode.trim(), details.city.trim()].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')
  const assignees = details.assignees.map((name) => name.trim()).filter(Boolean)
  const description = [
    assignees.length ? `Personas asignadas: ${escapeHtml(assignees.join(', '))}` : '',
    details.notes.trim()
      ? `Notas: ${escapeHtml(details.notes.trim()).replace(/\r?\n/g, '<br>')}`
      : '',
    `<a href="${escapeHtml(link.toString())}">Ver visita en Ábaco</a>`,
  ]
    .filter(Boolean)
    .join('<br><br>')
  return { summary: title || 'Visita Ábaco', location, description }
}
