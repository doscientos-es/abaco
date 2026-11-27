import { Button } from '@doscientos/ui'
import { CalendarBlankIcon, CaretRightIcon, ClockIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { calendarDate, dateValue, moveDays, todayInMadrid } from '@/shared/lib/date-range'
import { calendarTime, calendarVisibleRange, type CalendarEvent } from '@/shared/lib/event-calendar'
import { CalendarDetailsDialog } from '@/shared/ui/calendar-details-dialog'
import { CalendarToolbar } from '@/shared/ui/calendar-toolbar'
import { EventCalendar } from '@/shared/ui/event-calendar'
import { WorkerLoading, WorkerState } from '@/shared/ui/worker-state'

import { listMyVisits } from '../application/visit-actions'
import { toCalendarWallTime } from './agenda-calendar'
import { groupVisitsByContractDay, type VisitCalendarGroup } from './visit-calendar-groups'
import { WorkerVisitStatus } from './worker-visit-status'

const dateLabel = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' })

export function MyVisitsCalendar({
  tenantId,
  date,
  onDateChange,
  onSelectDay,
  onOpenVisit,
}: {
  tenantId: string
  date: string
  onDateChange: (date: string) => void
  onSelectDay: (date: string) => void
  onOpenVisit: (date: string, contractId: string | null, visitId: string) => void
}) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const value = calendarDate(date)
  const { from, to } = calendarVisibleRange(value, view)
  const visits = useQuery({
    queryKey: ['my-visits', tenantId, 'calendar', from, to],
    queryFn: async () => {
      // The assigned-visits API accepts at most 32 calendar days per request.
      const firstEnd = moveDays(from, 31) < to ? moveDays(from, 31) : to
      if (firstEnd === to) return listMyVisits(tenantId, from, to)
      const [first, rest] = await Promise.all([
        listMyVisits(tenantId, from, firstEnd),
        listMyVisits(tenantId, moveDays(firstEnd, 1), to),
      ])
      return [...first, ...rest]
    },
  })
  const groups = groupVisitsByContractDay(visits.data ?? [])
  const byId = new Map(groups.map((group) => [group.id, group]))
  const selected = selectedId ? byId.get(selectedId) : undefined
  const today = todayInMadrid()
  const items: CalendarEvent[] = groups.map((group) => ({
    id: group.id,
    title: group.title,
    start: group.start,
    end: group.end,
    description: `${group.visits.length} ${group.visits.length === 1 ? 'trabajo' : 'trabajos'}`,
    tone: group.visits.every((visit) => visit.status === 'completed') ? 'success' : 'primary',
  }))

  return (
    <section className="space-y-4" aria-label="Calendario de mis trabajos">
      <div className="border-border bg-card rounded-xl border p-2 sm:p-3">
        <CalendarToolbar
          value={value}
          view={view}
          today={calendarDate(today)}
          onDateChange={(day) => {
            setSelectedId(null)
            onDateChange(dateValue(day))
          }}
          actions={
            <fieldset className="bg-muted flex min-w-0 gap-1 rounded-lg p-0.5">
              <legend className="sr-only">Vista del calendario</legend>
              {(['week', 'month'] as const).map((period) => (
                <Button
                  key={period}
                  size="sm"
                  className="min-h-10"
                  variant={view === period ? 'outline' : 'ghost'}
                  aria-pressed={view === period}
                  onPress={() => {
                    setSelectedId(null)
                    setView(period)
                  }}
                >
                  {period === 'week' ? 'Semana' : 'Mes'}
                </Button>
              ))}
            </fieldset>
          }
        />
      </div>
      {visits.isPending ? <WorkerLoading label="Cargando calendario…" /> : null}
      {visits.isError && !visits.data ? (
        <WorkerState
          error
          title="No se pudo cargar el calendario"
          description="Comprueba tu conexión y vuelve a intentarlo."
          onRetry={() => void visits.refetch()}
        />
      ) : null}
      {visits.isError && visits.data ? (
        <div
          role="alert"
          className="border-border bg-card flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
        >
          El calendario no se pudo actualizar. Se muestran los datos anteriores.
          <Button variant="outline" size="sm" onPress={() => void visits.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {visits.data && view === 'week' ? (
        <WeekAgenda
          groups={groups}
          today={today}
          onSelectDay={onSelectDay}
          onOpenVisit={onOpenVisit}
        />
      ) : null}
      {visits.data && view === 'month' ? (
        <>
          {!items.length ? (
            <p className="text-muted-foreground text-sm">
              No tienes trabajos en los días de este calendario.
            </p>
          ) : null}
          <EventCalendar
            aria-label="Calendario de mis trabajos"
            view="month"
            value={value}
            items={items}
            showInstructions={false}
            onDayClick={(day) => onSelectDay(dateValue(day))}
            onItemClick={(item) => setSelectedId(item.id)}
            renderItem={(item) => {
              const group = byId.get(item.id)
              return group ? (
                <span>
                  {group.title} · {group.visits.length}{' '}
                  {group.visits.length === 1 ? 'trabajo' : 'trabajos'}
                </span>
              ) : (
                item.title
              )
            }}
          />
        </>
      ) : null}
      {selected ? (
        <CalendarDetailsDialog
          title={selected.title}
          description={dateLabel.format(selected.start)}
          onClose={() => setSelectedId(null)}
        >
          <VisitLinks
            groups={[selected]}
            onOpenVisit={(day, contractId, visitId) => {
              setSelectedId(null)
              onOpenVisit(day, contractId, visitId)
            }}
          />
        </CalendarDetailsDialog>
      ) : null}
    </section>
  )
}

function WeekAgenda({
  groups,
  today,
  onSelectDay,
  onOpenVisit,
}: {
  groups: VisitCalendarGroup[]
  today: string
  onSelectDay: (date: string) => void
  onOpenVisit: (date: string, contractId: string | null, visitId: string) => void
}) {
  const days = new Map<string, VisitCalendarGroup[]>()
  for (const group of groups) {
    const day = dateValue(group.start)
    const existing = days.get(day)
    if (existing) existing.push(group)
    else days.set(day, [group])
  }
  if (!days.size) {
    return (
      <WorkerState
        title="No tienes visitas esta semana"
        description="Cambia de semana con las flechas o elige una fecha en el calendario."
      />
    )
  }
  return (
    <section className="space-y-4" aria-label="Agenda de la semana">
      {[...days].map(([day, dayGroups]) => (
        <section key={day} className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-4">
            <h3 className="min-w-0 font-semibold">
              {day === today ? 'Hoy · ' : null}
              <time dateTime={day} className="inline-block first-letter:uppercase">
                {dateLabel.format(calendarDate(day))}
              </time>
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10"
              aria-label={`Ver jornada del ${dateLabel.format(calendarDate(day))}`}
              onPress={() => onSelectDay(day)}
            >
              <CalendarBlankIcon aria-hidden="true" /> Ver jornada
            </Button>
          </div>
          <div className="px-1 sm:px-2">
            <VisitLinks groups={dayGroups} onOpenVisit={onOpenVisit} />
          </div>
        </section>
      ))}
    </section>
  )
}

function VisitLinks({
  groups,
  onOpenVisit,
}: {
  groups: VisitCalendarGroup[]
  onOpenVisit: (date: string, contractId: string | null, visitId: string) => void
}) {
  return (
    <ul className="divide-border divide-y">
      {groups.flatMap((group) =>
        group.visits.map((visit) => (
          <li key={visit.id} className="py-1">
            <Button
              variant="ghost"
              className="h-auto min-h-14 w-full justify-between gap-2 px-2 py-2 whitespace-normal"
              onPress={() =>
                onOpenVisit(dateValue(group.start), visit.contract_id ?? null, visit.id)
              }
            >
              <span className="min-w-0 flex-1 space-y-1 text-left">
                <span className="block leading-snug font-semibold wrap-break-word">
                  {visit.title}
                </span>
                <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
                    <ClockIcon aria-hidden="true" />
                    {calendarTime(toCalendarWallTime(visit.scheduled_start_at, visit.timezone))}–
                    {calendarTime(toCalendarWallTime(visit.scheduled_end_at, visit.timezone))}
                  </span>
                  <span className="min-w-0 wrap-break-word">
                    {[visit.client_name, visit.location_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <WorkerVisitStatus status={visit.status} />
                <CaretRightIcon aria-hidden="true" />
              </span>
            </Button>
          </li>
        )),
      )}
    </ul>
  )
}
