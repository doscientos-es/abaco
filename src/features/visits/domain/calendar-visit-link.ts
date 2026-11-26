import { calendarDate, dateValue } from '@/shared/lib/date-range'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CalendarVisitLink = { empresa: string; visita: string; fecha: string }

/** A calendar link is only a pointer; access still comes from the signed-in session. */
export function parseCalendarVisitLink(search: Record<string, unknown>): CalendarVisitLink | null {
  const { empresa, visita, fecha } = search
  if (
    typeof empresa !== 'string' ||
    !uuid.test(empresa) ||
    typeof visita !== 'string' ||
    !uuid.test(visita) ||
    typeof fecha !== 'string' ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(fecha) ||
    dateValue(calendarDate(fecha)) !== fecha
  )
    return null
  return { empresa, visita, fecha }
}
