import { Button } from '@doscientos/ui'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'

import { dateValue, moveDays } from '@/shared/lib/date-range'
import { calendarDays, type CalendarEvent } from '@/shared/lib/event-calendar'
import { EventCalendar } from '@/shared/ui/event-calendar'
import { WorkerLoading, WorkerState } from '@/shared/ui/worker-state'

import { listMyVisits } from '../application/visit-actions'
import { calendarDateValue, moveCalendarMonth } from './agenda-calendar'
import { groupVisitsByContractDay } from './visit-calendar-groups'

export function MyVisitsCalendar({
  tenantId,
  date,
  onDateChange,
  onSelectDay,
  onOpenGroup,
}: {
  tenantId: string
  date: string
  onDateChange: (date: string) => void
  onSelectDay: (date: string) => void
  onOpenGroup: (date: string, contractId: string | null) => void
}) {
  const value = calendarDateValue(date)
  const days = calendarDays(value, 'month')
  const from = dateValue(days[0] ?? value)
  const to = dateValue(days.at(-1) ?? value)
  const visits = useQuery({
    queryKey: ['my-visits', tenantId, 'calendar', from, to],
    queryFn: async () => {
      // The assigned-visits API accepts at most 32 calendar days per request.
      const firstEnd = moveDays(from, 31) < to ? moveDays(from, 31) : to
      const first = await listMyVisits(tenantId, from, firstEnd)
      return firstEnd < to
        ? [...first, ...(await listMyVisits(tenantId, moveDays(firstEnd, 1), to))]
        : first
    },
  })
  const groups = groupVisitsByContractDay(visits.data ?? [])
  const byId = new Map(groups.map((group) => [group.id, group]))
  const items: CalendarEvent[] = groups.map((group) => ({
    id: group.id,
    title: group.title,
    start: group.start,
    end: group.end,
    description: `${group.visits.length} ${group.visits.length === 1 ? 'trabajo' : 'trabajos'}`,
    tone: group.visits.every((visit) => visit.status === 'completed') ? 'success' : 'primary',
  }))
  return (
    <section className="space-y-3" aria-label="Calendario de mis trabajos">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          className="size-10 p-0"
          aria-label="Mes anterior"
          onPress={() => onDateChange(moveCalendarMonth(date, -1))}
        >
          <CaretLeftIcon aria-hidden="true" />
        </Button>
        <h2 className="font-semibold capitalize">
          {value.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
        </h2>
        <Button
          variant="outline"
          className="size-10 p-0"
          aria-label="Mes siguiente"
          onPress={() => onDateChange(moveCalendarMonth(date, 1))}
        >
          <CaretRightIcon aria-hidden="true" />
        </Button>
      </div>
      {visits.isPending ? <WorkerLoading label="Cargando calendario…" /> : null}
      {visits.isError ? (
        <WorkerState
          error
          title="No se pudo cargar el calendario"
          description="Comprueba tu conexión y vuelve a intentarlo."
          onRetry={() => void visits.refetch()}
        />
      ) : null}
      {!visits.isPending && !visits.isError ? (
        <EventCalendar
          aria-label="Calendario de mis trabajos"
          view="month"
          value={value}
          items={items}
          showInstructions={false}
          onDayClick={(day) => onSelectDay(dateValue(day))}
          onItemClick={(item) => {
            const group = byId.get(item.id)
            if (group) onOpenGroup(dateValue(group.start), group.visits[0]?.contract_id ?? null)
          }}
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
      ) : null}
    </section>
  )
}
