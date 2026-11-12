import { Button, Popover, toast } from '@doscientos/ui'
import { Info } from '@phosphor-icons/react'
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
      className="min-w-0 space-y-4 rounded-lg border p-4 sm:p-5"
      aria-label="Calendario de vacaciones y asuntos propios"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Calendario de ausencias</h2>
          <Popover
            placement="bottom start"
            className="w-[min(22rem,calc(100vw-2rem))] space-y-2 p-4 text-sm"
            trigger={
              <Button
                variant="ghost"
                size="sm"
                aria-label="Información del calendario"
                className="size-8 p-0"
              >
                <Info aria-hidden="true" className="size-4" />
              </Button>
            }
          >
            <p>
              Los recuentos diarios indican personas distintas con ausencias aprobadas o pendientes.
              El resumen del intervalo no implica coincidencia en un mismo día; no incluye saldos ni
              cupos.
            </p>
            <p>
              Las ausencias sin fecha final se muestran hasta el final de la vista. Las vacaciones y
              bajas aprobadas bloquean nuevas visitas en esas fechas.
            </p>
            {onEdit ? (
              <p>
                Teclado: Alt + flechas mueve la ausencia; Alt + Mayús + flechas cambia su duración.
              </p>
            ) : null}
          </Popover>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onPress={() => onRange(`${month}-01`, `${month}-15`)}>
            Primera quincena
          </Button>
          <Button size="sm" variant="outline" onPress={() => onRange(`${month}-16`, lastMonthDay)}>
            Segunda quincena
          </Button>
        </div>
      </div>
      <CalendarToolbar value={date} view={view} onDateChange={setDate} onViewChange={setView} />
      <p className="text-muted-foreground text-xs">Aprobadas / pendientes</p>
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">
          {start} — {end}
        </h3>
        <p className="text-muted-foreground text-sm">
          {totals.approvedPeople} personas aprobadas · {totals.pendingPeople} pendientes
        </p>
      </div>
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
