export const vacationRequestStatuses = ['pending', 'needs_info', 'approved', 'rejected'] as const

export const absenceTypes = ['vacation', 'sick_leave', 'personal_leave', 'other'] as const

export type AbsenceType = (typeof absenceTypes)[number]

export type VacationRequestStatus = (typeof vacationRequestStatuses)[number]

export type VacationRequest = Readonly<{
  id: string
  requesterId: string
  requesterName: string
  absenceType: AbsenceType
  startDate: string
  endDate: string | null
  comment: string
  status: VacationRequestStatus
  submittedAt: string
  decisionComment: string
  decidedAt: string | null
  decidedByName: string
  informationRequestComment: string
  requesterResponseComment: string
}>

export const vacationRequestStatusLabels: Record<VacationRequestStatus, string> = {
  pending: 'Pendiente',
  needs_info: 'Necesita información',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

export const absenceTypeLabels: Record<AbsenceType, string> = {
  vacation: 'Vacaciones',
  sick_leave: 'Baja',
  personal_leave: 'Permiso',
  other: 'Otra ausencia',
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

export function isValidAbsencePeriod(startDate: string, endDate: string): boolean {
  return isDateOnly(startDate) && (endDate === '' || (isDateOnly(endDate) && startDate <= endDate))
}
