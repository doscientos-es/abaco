import type { VacationRequest } from './vacation-request'

export function absencesInRange(requests: readonly VacationRequest[], from: string, through: string) {
  if (from > through) return []
  return requests.filter(r => r.startDate <= through && (r.endDate ?? '9999-12-31') >= from)
}

/** Interval totals are unique people, not a claim that they coincide on one day. */
export function absenceOccupancy(requests: readonly VacationRequest[], from: string, through: string) {
  const matching = absencesInRange(requests,from,through)
  const approved = matching.filter(r => r.status === 'approved')
  const pending = matching.filter(r => r.status === 'pending' || r.status === 'needs_info')
  return { approved, pending, approvedPeople:new Set(approved.map(r => r.requesterId)).size, pendingPeople:new Set(pending.map(r => r.requesterId)).size }
}

export function overlappingEmployeeAbsences(requests: readonly VacationRequest[], person: string, from: string, through: string | null, excludingId?: string) {
  if (!person || !from) return []
  return absencesInRange(requests,from,through || '9999-12-31').filter(r => r.id !== excludingId && r.requesterId === person && !['rejected','canceled'].includes(r.status))
}