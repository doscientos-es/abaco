import { dateValue } from '@/shared/lib/date-range'

import type { VisitSummary } from '../application/visit-actions'
import { toCalendarWallTime } from './agenda-calendar'

export type VisitCalendarGroup = {
  id: string
  title: string
  start: Date
  end: Date
  visits: [VisitSummary, ...VisitSummary[]]
}

/** Keep a contract's visits together on their local start day, without merging unrelated visits. */
export function groupVisitsByContractDay(visits: VisitSummary[]): VisitCalendarGroup[] {
  const groups = new Map<string, VisitCalendarGroup>()
  for (const visit of visits) {
    const start = toCalendarWallTime(visit.scheduled_start_at, visit.timezone)
    const end = toCalendarWallTime(visit.scheduled_end_at, visit.timezone)
    const key = visit.contract_id ? `contract:${visit.contract_id}:${dateValue(start)}` : visit.id
    const group = groups.get(key)
    if (group) {
      group.visits.push(visit)
      if (start < group.start) group.start = start
      if (end > group.end) group.end = end
    } else {
      groups.set(key, {
        id: key,
        title: visit.contract_title || visit.title,
        start,
        end,
        visits: [visit],
      })
    }
  }
  return [...groups.values()]
    .map((group) => {
      group.visits.sort(
        (a, b) =>
          a.scheduled_start_at.localeCompare(b.scheduled_start_at) || a.id.localeCompare(b.id),
      )
      return { ...group, id: group.visits.length === 1 ? group.visits[0].id : group.id }
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id))
}
