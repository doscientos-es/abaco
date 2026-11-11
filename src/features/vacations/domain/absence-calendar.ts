import { calendarDate, dateValue } from '@/shared/lib/date-range'

export {
  calendarDate,
  dateValue,
  moveDays,
  moveMonths,
  selectRangeDay as selectAbsenceDay,
} from '@/shared/lib/date-range'

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
