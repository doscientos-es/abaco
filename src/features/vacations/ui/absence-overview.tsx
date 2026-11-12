import { Button, toast } from '@doscientos/ui'
import { useState } from 'react'

import { calendarDate, dateValue } from '@/shared/lib/date-range'
import { calendarDays, type EventCalendarView } from '@/shared/lib/event-calendar'
import { CalendarDetailsDialog } from '@/shared/ui/calendar-details-dialog'
import { CalendarToolbar } from '@/shared/ui/calendar-toolbar'
import { EventCalendar } from '@/shared/ui/event-calendar'

import {
  absenceEvents,
  absenceCalendarProposal,
  type AbsenceCalendarProposal,
} from '../domain/absence-events'
import {
  absenceTypeLabels,
  vacationRequestStatusLabels,
  type VacationRequest,
} from '../domain/vacation-request'

export function AbsenceOverview({
  requests,
  onRange,
  onEdit,
}: {
  requests: VacationRequest[]
  onRange: (from: string, through: string) => void
  onEdit?: ((request: VacationRequest, proposal?: AbsenceCalendarProposal) => void) | undefined
}) {
  const [date, setDate] = useState(() =>
    calendarDate(
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date()),
    ),
  )
  const [view, setView] = useState<EventCalendarView>('month')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const days = calendarDays(date, view)
  const selected = requests.find((request) => request.id === selectedId)
  return (
    <section className="min-w-0 space-y-4" aria-label="Calendario de ausencias">
      <CalendarToolbar value={date} view={view} onDateChange={setDate} onViewChange={setView} />
      <EventCalendar
        allDayOnly
        showInstructions={false}
        key={`${view}:${dateValue(date)}`}
        value={date}
        view={view}
        aria-label="Calendario de ausencias"
        items={absenceEvents(requests, dateValue(days.at(-1) ?? date), Boolean(onEdit))}
        onItemClick={(item) => setSelectedId(item.id)}
        onItemChange={
          onEdit
            ? (change) => {
                const request = requests.find((request) => request.id === change.item.id)
                if (request && request.status !== 'rejected' && request.status !== 'canceled') {
                  if (request.updatedAt !== change.item.revision) {
                    toast.error('El periodo ha cambiado. Revisa los datos antes de editarlo.')
                    return
                  }
                  setSelectedId(null)
                  onEdit(request, absenceCalendarProposal(request, change))
                }
              }
            : undefined
        }
        onDayClick={(day) => onRange(dateValue(day), dateValue(day))}
      />
      {selected ? (
        <CalendarDetailsDialog
          title={selected.requesterName}
          description={absenceTypeLabels[selected.absenceType]}
          onClose={() => setSelectedId(null)}
        >
          <p>
            {selected.startDate} — {selected.endDate ?? 'Sin fin confirmado'} ·{' '}
            {vacationRequestStatusLabels[selected.status]}
          </p>
          <p className="whitespace-pre-wrap">{selected.comment}</p>
          <p className="whitespace-pre-wrap">{selected.decisionComment}</p>
          {onEdit ? (
            <Button
              onPress={() => {
                setSelectedId(null)
                onEdit(selected)
              }}
            >
              Editar / cancelar
            </Button>
          ) : null}
        </CalendarDetailsDialog>
      ) : null}
    </section>
  )
}
