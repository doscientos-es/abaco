import type { VisitSummary } from '../application/visit-actions'
import { localVisitDay } from './next-assigned-visit'

export type DelayNoticeVisit = Pick<VisitSummary, 'status' | 'scheduled_start_at' | 'timezone'>

function visitWallClock(value: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value)
}

export function visitCanPrepareDelay(visit: DelayNoticeVisit, now: number) {
  if (visit.status !== 'scheduled' || !Number.isFinite(now)) return false
  try {
    return (
      localVisitDay(visit) ===
      localVisitDay({
        scheduled_start_at: new Date(now).toISOString(),
        timezone: visit.timezone,
      })
    )
  } catch {
    return false
  }
}

export function visitDelayTimeError(visit: DelayNoticeVisit, time: string, now: number) {
  if (!visitCanPrepareDelay(visit, now))
    return 'La visita ya no está disponible para preparar un aviso.'
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    return 'Indica una hora de llegada en formato HH:mm.'
  const scheduled = visitWallClock(new Date(visit.scheduled_start_at), visit.timezone)
  if (time <= scheduled) return 'Elige una hora posterior a la hora prevista de la visita.'
  if (time <= visitWallClock(new Date(now), visit.timezone))
    return 'Elige una hora que todavía no haya pasado.'
  return null
}

export function visitDelayDraft(time: string) {
  return `Hola. Le avisamos de que la visita prevista para hoy se retrasa. Prevemos llegar sobre las ${time}. Disculpe las molestias.`
}
