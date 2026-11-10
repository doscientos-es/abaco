/** Calendar dates are local days, never UTC timestamps. */
export function calendarDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setFullYear(year ?? 0, (month ?? 1) - 1, day ?? 1)
  date.setHours(12, 0, 0, 0)
  return date
}

export function dateValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function moveDays(value: string, days: number): string {
  const date = calendarDate(value)
  date.setDate(date.getDate() + days)
  return dateValue(date)
}

export function moveMonths(value: string, months: number): string {
  const date = calendarDate(value)
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, last))
  return dateValue(date)
}

/** Monday-first calendar, with empty cells before the first day. */
export function monthWeeks(value: string): (string | null)[][] {
  const first = calendarDate(value)
  first.setDate(1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const cells: (string | null)[] = Array.from({ length: offset }, () => null)
  for (let day = 1; day <= days; day++) {
    first.setDate(day)
    cells.push(dateValue(first))
  }
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  )
}

export function selectAbsenceDay(start: string, end: string, day: string) {
  if (!start || end) return { start: day, end: '' }
  return day < start ? { start: day, end: start } : { start, end: day }
}
