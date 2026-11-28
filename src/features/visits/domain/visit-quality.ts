import { calendarDate, moveDays } from '@/shared/lib/date-range'

export const qualityStatusLabels = {
  reviewed: 'Revisada sin corrección',
  pending: 'Corrección pendiente',
  in_progress: 'Corrección en curso',
  corrected: 'Corregida',
}
export const qualityCategoryLabels = {
  evidence: 'Evidencia o documentación',
  service: 'Ejecución del servicio',
  follow_up: 'Verificación posterior',
}
export type QualityStatus = keyof typeof qualityStatusLabels
export type QualityCategory = keyof typeof qualityCategoryLabels
export type QualityMode = 'sample' | 'open'

export type QualityState = {
  revision: number
  status: QualityStatus | null
  category: QualityCategory | null
  owner_id: string | null
}

export function lastClosedQualityWeek(today: string) {
  return moveDays(today, -((calendarDate(today).getDay() + 6) % 7) - 7)
}

export function qualityStatuses(current: QualityState['status']): QualityStatus[] {
  if (current === null) return ['reviewed', 'pending']
  if (current === 'corrected' || current === 'reviewed') return ['pending']
  return ['pending', 'in_progress', 'corrected']
}
