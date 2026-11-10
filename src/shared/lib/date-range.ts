/** Date-only values represent local calendar days, not UTC timestamps. */
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

export function selectRangeDay(start: string, end: string, day: string) {
  if (!start || end) return { start: day, end: '' }
  return day < start ? { start: day, end: start } : { start, end: day }
}

export function dateRangePresets(today: string) {
  const monday = moveDays(today, -((calendarDate(today).getDay() + 6) % 7))
  return [
    { label: 'Hoy', start: today, end: today },
    { label: 'Ayer', start: moveDays(today, -1), end: moveDays(today, -1) },
    { label: 'Esta semana', start: monday, end: moveDays(monday, 6) },
    { label: 'La semana que viene', start: moveDays(monday, 7), end: moveDays(monday, 13) },
    { label: 'Este mes', start: `${today.slice(0, 7)}-01`, end: moveDays(moveMonths(`${today.slice(0, 7)}-01`, 1), -1) },
  ]
}