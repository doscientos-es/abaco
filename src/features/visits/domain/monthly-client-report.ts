import type { VisitStatus } from '../application/visit-actions'

export const monthlyClientReportLimit = 300
export const monthlyClientReportPeriod =
  'El mes usa la hora de Madrid. Cuenta las visitas por su inicio previsto y los extras por su fecha de propuesta, con su estado actual.'
export const monthlyClientReportDisclaimer =
  'Informe operativo. No es una factura ni acredita el cobro o la aceptación de trabajos.'

export const monthlyVisitStatuses: Record<VisitStatus, string> = {
  scheduled: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Realizada',
  canceled: 'Cancelada',
  skipped: 'Omitida',
}

export const monthlyExtraStatuses = {
  pending: 'Pendiente de aprobación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
} as const

export type MonthlyVisit = {
  id: string
  title: string
  centre: string
  date: string
  status: VisitStatus
}
export type MonthlyExtra = {
  id: string
  title: string
  centre: string
  date: string
  status: keyof typeof monthlyExtraStatuses
  quantity: number
  unit: string
}
export type MonthlyClientReport = { visits: MonthlyVisit[]; extras: MonthlyExtra[] }
export type MonthlyReportDisplay = MonthlyClientReport & {
  month: string
  clientName: string
  centreName: string
}

const madridOffset = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  timeZoneName: 'longOffset',
})
const madridDate = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  dateStyle: 'medium',
})
const madridMonth = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  month: 'long',
  year: 'numeric',
})
const quantityFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 })

function madridMonthStart(year: number, monthIndex: number) {
  const utc = Date.UTC(year, monthIndex, 1)
  // Madrid changes its offset mid-month; get the actual offset independently at each boundary.
  const zone = madridOffset.formatToParts(new Date(utc)).find(({ type }) => type === 'timeZoneName')
  if (zone?.value === 'GMT') return new Date(utc).toISOString()
  const offset = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(zone?.value ?? '')
  if (!offset) throw new Error('No se pudo calcular el comienzo del mes.')
  const seconds =
    (Number(offset[2]) * 3600 + Number(offset[3]) * 60 + Number(offset[4] ?? 0)) *
    (offset[1] === '-' ? -1 : 1)
  return new Date(utc - seconds * 1000).toISOString()
}

export function monthlyClientReportRange(value: string) {
  if (!/^(?:19\d{2}|20\d{2})-(?:0[1-9]|1[0-2])$/.test(value)) return null
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7)) - 1
  return { from: madridMonthStart(year, month), before: madridMonthStart(year, month + 1) }
}

export function monthlyReportMonthLabel(month: string) {
  return madridMonth.format(new Date(`${month}-15T12:00:00Z`))
}

export function monthlyReportDateLabel(instant: string) {
  return madridDate.format(new Date(instant))
}

export function summarizeMonthlyClientReport(report: MonthlyClientReport) {
  const completed = report.visits.filter(({ status }) => status === 'completed').length
  const pending = report.visits.filter(
    ({ status }) => status === 'scheduled' || status === 'in_progress',
  ).length
  return {
    completed,
    pending,
    canceledOrSkipped: report.visits.length - completed - pending,
    extras: report.extras.length,
  }
}

export function monthlyReportExtraQuantity(extra: Pick<MonthlyExtra, 'quantity' | 'unit'>) {
  return `${quantityFormat.format(extra.quantity)} ${extra.unit}`
}
