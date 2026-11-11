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
import { absenceOccupancy } from '../domain/absence-occupancy'
import {
  absenceTypeLabels,
  vacationRequestStatusLabels,
  type VacationRequest,
} from '../domain/vacation-request'

export function AbsenceOverview({
  requests,
  from,
  through,
  onRange,
  onEdit,
}: {
  requests: VacationRequest[]
  from: string
  through: string
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
  const month = dateValue(date).slice(0, 7)
  const lastMonthDay = dateValue(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12))
  const start = from || (view === 'month' ? `${month}-01` : dateValue(days[0] ?? date))
  const end = through || (view === 'month' ? lastMonthDay : dateValue(days.at(-1) ?? date))
  const totals = absenceOccupancy(requests, start, end)
  const selected = requests.find((request) => request.id === selectedId)
  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      aria-label="Calendario de vacaciones y asuntos propios"
    >
      <h2 className="font-semibold">Calendario y coincidencias</h2>
      <CalendarToolbar value={date} view={view} onDateChange={setDate} onViewChange={setView} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onPress={() => onRange(`${month}-01`, `${month}-15`)}>
          Primera quincena
        </Button>
        <Button variant="outline" onPress={() => onRange(`${month}-16`, lastMonthDay)}>
          Segunda quincena
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Cada casilla cuenta personas únicas: aprobadas / pendientes. Pulsa un día para ver nombres.
        No se calculan saldos ni cupos.
      </p>
      <p className="text-muted-foreground text-sm">
        Las ausencias ocupan días completos. Los periodos sin fin se muestran hasta el final de la
        vista, sin cerrar su fecha.
      </p>
      <EventCalendar
        allDayOnly
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
        renderDaySummary={(day) => {
          const count = absenceOccupancy(requests, dateValue(day), dateValue(day))
          return (
            <span
              className="text-muted-foreground text-xs"
              aria-label={`${count.approvedPeople} personas aprobadas, ${count.pendingPeople} pendientes`}
            >
              {count.approvedPeople} / {count.pendingPeople}
            </span>
          )
        }}
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
      <h3 className="font-medium">
        {start} — {end}
      </h3>
      <p>
        {totals.approvedPeople} personas con alguna ausencia aprobada · {totals.pendingPeople} con
        alguna petición pendiente en el intervalo. No significa que coincidan todas el mismo día.
      </p>
      <ul className="space-y-1 text-sm">
        {[...totals.approved, ...totals.pending].map((r) => (
          <li key={r.id}>
            {r.requesterName} · {r.startDate} — {r.endDate ?? 'Sin fin confirmado'} ·{' '}
            {absenceTypeLabels[r.absenceType]} ·{' '}
            {r.status === 'approved' ? 'Aprobada' : 'Pendiente'}
          </li>
        ))}
      </ul>
      {!totals.approved.length && !totals.pending.length ? (
        <p>No hay ausencias aprobadas ni pendientes en este intervalo.</p>
      ) : null}
    </section>
  )
}
