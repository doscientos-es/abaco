import { moveDays } from '@/shared/lib/date-range'

import type { VisitSummary } from '../application/visit-actions'

export const historyDays = 30

export function closedVisitHistoryRange(today: string, page: number) {
  const to = moveDays(today, -page * historyDays)
  return { from: moveDays(to, 1 - historyDays), to }
}

function normalized(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-ES').trim()
}

export function selectClosedVisitHistory(visits: readonly VisitSummary[], search: string) {
  const terms = normalized(search).split(/\s+/).filter(Boolean)
  return visits
    .filter((visit) => {
      if (visit.status !== 'completed') return false
      const fields = normalized(
        [visit.title, visit.client_name, visit.location_name, visit.contract_title].join(' '),
      )
      return terms.every((term) => fields.includes(term))
    })
    .sort(
      (left, right) =>
        Date.parse(right.scheduled_start_at) - Date.parse(left.scheduled_start_at) ||
        left.id.localeCompare(right.id),
    )
}
