export type VacationDateRange = Readonly<{
  userId: string
  startDate: string
  endDate: string
}>

function localDateAt(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant))
}

/** Vacation requests are inclusive local calendar dates; visit end times are exclusive. */
export function visitOverlapsVacation(
  visit: { assignedUserId: string | null; startAt: string; endAt: string; timezone: string },
  vacation: VacationDateRange,
): boolean {
  if (visit.assignedUserId !== vacation.userId) return false
  const startDate = localDateAt(visit.startAt, visit.timezone)
  const lastOccupiedInstant = new Date(Date.parse(visit.endAt) - 1).toISOString()
  const endDate = localDateAt(lastOccupiedInstant, visit.timezone)
  return startDate <= vacation.endDate && endDate >= vacation.startDate
}
