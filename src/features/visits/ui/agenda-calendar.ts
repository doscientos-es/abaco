export function calendarWeekRange(date: string) {
  const start = new Date(`${date}T12:00:00Z`)
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  const from = start.toISOString().slice(0, 10)
  start.setUTCDate(start.getUTCDate() + 6)
  return { from, to: start.toISOString().slice(0, 10) }
}

export function calendarMonthRange(date: string) {
  const first = `${date.slice(0, 7)}-01`
  const last = new Date(`${first}T12:00:00Z`)
  last.setUTCMonth(last.getUTCMonth() + 1, 0)
  return { from: first, to: last.toISOString().slice(0, 10) }
}

export function moveCalendarMonth(date: string, direction: number) {
  const first = new Date(`${date.slice(0, 7)}-01T12:00:00Z`)
  first.setUTCMonth(first.getUTCMonth() + direction)
  return first.toISOString().slice(0, 10)
}

export function calendarDateValue(date: string) {
  return new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    12,
  )
}

export function toCalendarWallTime(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return new Date(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
  )
}

export function calendarWeekLabel(date: string) {
  const { from, to } = calendarWeekRange(date)
  const start = calendarDateValue(from)
  const end = calendarDateValue(to)
  const shortDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
  return `${shortDate.format(start)} – ${shortDate.format(end)}, ${end.getFullYear()}`
}
