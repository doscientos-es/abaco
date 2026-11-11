export type WeeklyTimeSlot = {
  id: string
  weekday: number
  start_minute: number
  duration_minutes: number
}

export const scheduleDays = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
]
export const maxContractDays = 3660

export function minuteLabel(minute: number) {
  return `${String(Math.floor((minute % 1440) / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export function weeklyScheduleError(slots: WeeklyTimeSlot[]) {
  if (!slots.length) return 'Marca al menos una franja en el calendario semanal.'
  if (slots.length > 56) return 'El horario admite hasta 56 franjas semanales.'
  const ids = new Set<string>()
  for (const slot of slots) {
    if (
      !/^[a-zA-Z0-9-]{1,64}$/.test(slot.id) ||
      ids.has(slot.id) ||
      !Number.isInteger(slot.weekday) ||
      slot.weekday < 1 ||
      slot.weekday > 7 ||
      !Number.isInteger(slot.start_minute) ||
      slot.start_minute < 0 ||
      slot.start_minute > 1425 ||
      slot.start_minute % 15 ||
      !Number.isInteger(slot.duration_minutes) ||
      slot.duration_minutes < 15 ||
      slot.duration_minutes > 720 ||
      slot.duration_minutes % 15
    )
      return 'Cada franja debe durar entre 15 minutos y 12 horas, en intervalos de 15 minutos.'
    ids.add(slot.id)
  }
  const intervals = slots.map((slot) => ({
    start: (slot.weekday - 1) * 1440 + slot.start_minute,
    duration: slot.duration_minutes,
  }))
  if (
    intervals.some((a, i) =>
      intervals.some(
        (b, j) =>
          i !== j &&
          [-10080, 0, 10080].some(
            (offset) =>
              a.start < b.start + offset + b.duration && a.start + a.duration > b.start + offset,
          ),
      ),
    )
  )
    return 'Las franjas del mismo trabajo no pueden solaparse.'
  return null
}

export function contractDatesError(start: string, end: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
      ? date.getTime()
      : NaN
  }
  const from = parse(start)
  const to = parse(end)
  if (!Number.isFinite(from) || !Number.isFinite(to))
    return 'Indica las fechas de inicio y fin del contrato.'
  if (to < from) return 'La fecha de fin no puede ser anterior al inicio.'
  if ((to - from) / 86400000 > maxContractDays)
    return 'La vigencia máxima es de 10 años; divide los acuerdos más largos.'
  return null
}

/** Count actual occurrences, including partial first/last weeks and alternate-week anchors. */
export function weeklyOccurrenceCount(
  slots: WeeklyTimeSlot[],
  start: string,
  end: string,
  alternate = false,
) {
  if (contractDatesError(start, end)) return 0
  const first = new Date(`${start}T00:00:00Z`)
  const anchorMonday = first.getTime() - ((first.getUTCDay() + 6) % 7) * 86400000
  let count = 0
  for (let time = first.getTime(); time <= Date.parse(`${end}T00:00:00Z`); time += 86400000) {
    const weekday = ((new Date(time).getUTCDay() + 6) % 7) + 1
    if (!alternate || Math.floor((time - anchorMonday) / (7 * 86400000)) % 2 === 0)
      count += slots.filter(
        (slot) =>
          slot.weekday === weekday &&
          (time < Date.parse(`${end}T00:00:00Z`) ||
            slot.start_minute + slot.duration_minutes <= 1440),
      ).length
  }
  return count
}
