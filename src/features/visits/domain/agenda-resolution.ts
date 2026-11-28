import {
  visitOverlapsVacation,
  type VacationDateRange,
} from '@/features/vacations/domain/vacation-conflict'

type AgendaVisit = {
  id: string
  status: string
  timezone: string
  scheduled_start_at: string
  scheduled_end_at: string
  assigned_user_id?: string | null | undefined
  work_team_id?: string | null | undefined
}

type ResolutionKind = 'unassigned' | 'approved-absence' | 'assignment-unknown'

export function agendaResolution<T extends AgendaVisit>(
  visits: T[],
  absences: VacationDateRange[] | undefined,
  day: string,
) {
  const entries: { visit: T; kind: ResolutionKind }[] = []
  let uncheckedAbsences = 0
  const dates = new Map<string, Intl.DateTimeFormat>()
  const byAssignee = new Map<string, VacationDateRange[]>()
  for (const absence of absences ?? []) {
    const ranges = byAssignee.get(absence.userId)
    if (ranges) ranges.push(absence)
    else byAssignee.set(absence.userId, [absence])
  }

  for (const visit of visits) {
    if (visit.status !== 'scheduled') continue
    let dateFormat = dates.get(visit.timezone)
    if (!dateFormat) {
      dateFormat = new Intl.DateTimeFormat('sv-SE', {
        timeZone: visit.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      dates.set(visit.timezone, dateFormat)
    }
    if (dateFormat.format(new Date(visit.scheduled_start_at)) !== day) continue

    const assignee = visit.assigned_user_id
    const team = visit.work_team_id
    if (assignee === null && team === null) {
      entries.push({ visit, kind: 'unassigned' })
    } else if (assignee) {
      if (!absences) {
        uncheckedAbsences += 1
      } else {
        const conflict = byAssignee.get(assignee)?.some((absence) =>
          visitOverlapsVacation(
            {
              assignedUserId: assignee,
              startAt: visit.scheduled_start_at,
              endAt: visit.scheduled_end_at,
              timezone: visit.timezone,
            },
            absence,
          ),
        )
        if (conflict) entries.push({ visit, kind: 'approved-absence' })
      }
    } else if (!team) {
      // The enrichment query can omit a row. An absent property is not a confirmed SQL NULL.
      entries.push({ visit, kind: 'assignment-unknown' })
    }
  }
  entries.sort(
    (a, b) =>
      Date.parse(a.visit.scheduled_start_at) - Date.parse(b.visit.scheduled_start_at) ||
      a.visit.id.localeCompare(b.visit.id),
  )
  return { entries, uncheckedAbsences }
}
