export const openingScheduleDays = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const

/** ISO weekday and local wall times in the centre's timezone. End can be on the next day. */
export type OpeningSlot = { weekday: number; start: string; end: string }
export type OpeningSchedule = OpeningSlot[]

const minutesPerDay = 24 * 60
const minutesPerWeek = 7 * minutesPerDay

function timeMinutes(value: string): number | null {
  if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) return null
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
}

export function openingScheduleError(schedule: OpeningSchedule | null): string | null {
  if (schedule === null) return null
  if (schedule.length > 56) return 'El horario admite un máximo de 56 franjas.'
  const intervals: { start: number; end: number }[] = []
  for (const slot of schedule) {
    const start = timeMinutes(slot.start)
    const end = timeMinutes(slot.end)
    if (
      !Number.isInteger(slot.weekday) ||
      slot.weekday < 1 ||
      slot.weekday > 7 ||
      start === null ||
      end === null
    ) {
      return 'Completa el día y las horas de todas las franjas.'
    }
    if (start === end && start !== 0) return 'La hora de inicio y fin no puede ser la misma.'
    const absoluteStart = (slot.weekday - 1) * minutesPerDay + start
    const duration = end > start ? end - start : minutesPerDay - start + end
    intervals.push({ start: absoluteStart, end: absoluteStart + duration })
  }
  for (const [i, a] of intervals.entries()) {
    for (const b of intervals.slice(i + 1)) {
      if (
        [-minutesPerWeek, 0, minutesPerWeek].some(
          (shift) => a.start < b.end + shift && b.start + shift < a.end,
        )
      ) {
        return 'Hay franjas que se solapan, incluso entre días consecutivos.'
      }
    }
  }
  return null
}

export function formatOpeningSchedule(schedule: OpeningSchedule): string {
  return openingScheduleDays
    .map((day, index) => {
      const slots = schedule
        .filter(({ weekday }) => weekday === index + 1)
        .sort((a, b) => a.start.localeCompare(b.start))
      const times = slots.map(({ start, end }) => {
        if (start === '00:00' && end === '00:00') return '24 horas'
        return `${start}–${end}${end <= start ? ' (+1 día)' : ''}`
      })
      return `${day}: ${times.length ? times.join(', ') : 'Cerrado'}`
    })
    .join('; ')
}
