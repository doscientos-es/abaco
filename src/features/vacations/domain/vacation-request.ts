export const vacationRequestStatuses = ['pending', 'approved', 'rejected'] as const

export type VacationRequestStatus = (typeof vacationRequestStatuses)[number]

export type VacationRequest = Readonly<{
  id: string
  requesterId: string
  requesterName: string
  startDate: string
  endDate: string
  comment: string
  status: VacationRequestStatus
  submittedAt: string
  decisionComment: string
  decidedAt: string | null
  decidedByName: string
}>

export const vacationRequestStatusLabels: Record<VacationRequestStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

/** Vacation ranges use inclusive local calendar dates, not UTC instants. */
export function isValidVacationPeriod(startDate: string, endDate: string): boolean {
  return isDateOnly(startDate) && isDateOnly(endDate) && startDate <= endDate
}
