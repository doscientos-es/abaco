import { calendarDate, dateValue, moveDays } from '@/shared/lib/date-range'
import {
  atCalendarMinutes,
  type CalendarEvent,
  type CalendarEventChange,
} from '@/shared/lib/event-calendar'

import {
  absenceTypeLabels,
  vacationRequestStatusLabels,
  type VacationRequest,
} from './vacation-request'

export type AbsenceCalendarProposal = { startDate: string; endDate: string | null }

export function absenceEvents(
  requests: VacationRequest[],
  through: string,
  editable: boolean,
): CalendarEvent[] {
  return requests.map((request) => ({
    id: request.id,
    revision: request.updatedAt,
    title: `${request.requesterName} · ${absenceTypeLabels[request.absenceType]}`,
    start: atCalendarMinutes(calendarDate(request.startDate), 0),
    end: atCalendarMinutes(
      calendarDate(
        moveDays(request.endDate ?? (through > request.startDate ? through : request.startDate), 1),
      ),
      0,
    ),
    allDay: true,
    editable: editable && request.status !== 'canceled' && request.status !== 'rejected',
    tone:
      request.status === 'approved'
        ? 'success'
        : request.status === 'canceled' || request.status === 'rejected'
          ? 'muted'
          : 'warning',
    description: `${vacationRequestStatusLabels[request.status]}${request.endDate ? '' : ' · Sin fin confirmado'}`,
  }))
}

export function absenceCalendarProposal(
  request: VacationRequest,
  change: CalendarEventChange,
): AbsenceCalendarProposal {
  return {
    startDate: dateValue(change.start),
    endDate:
      request.endDate === null && change.kind === 'move'
        ? null
        : moveDays(dateValue(change.end), -1),
  }
}
