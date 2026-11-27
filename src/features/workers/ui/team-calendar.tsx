import { Badge, Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import type { TeamMember } from '@/features/settings/application/team-actions'
import { staffSchedulesQuery } from '@/features/staff-schedules'
import { type WorkTeam, workTeamLabel } from '@/features/work-teams'
import { calendarDate, moveDays, todayInMadrid } from '@/shared/lib/date-range'
import { WorkerLoading, WorkerState } from '@/shared/ui/worker-state'

import { teamCalendarAbsencesQuery } from '../application/team-calendar-queries'
import {
  teamCalendarCell,
  teamCalendarDays,
  type TeamCalendarAbsence,
} from '../domain/team-calendar'
import type { WorkersSearch } from '../domain/worker-navigation'
import { TeamWeekGrid } from './team-week-grid'

const dateLabel = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const controlClass =
  'border-input bg-background focus-visible:ring-ring min-h-10 w-full min-w-0 max-w-full rounded-md border px-3 text-sm focus-visible:ring-2 sm:w-auto'

export function TeamCalendar({
  tenantId,
  userId,
  search,
  people,
  teams,
  memberIds,
  onSearchChange,
}: {
  tenantId: string
  userId: string
  search: WorkersSearch
  people: TeamMember[]
  teams: WorkTeam[]
  memberIds: string[] | undefined
  onSearchChange: (search: WorkersSearch) => void
}) {
  const today = todayInMadrid()
  const selectedDate = search.fecha ?? today
  const days = teamCalendarDays(calendarDate(selectedDate))
  const first = days[0]
  const last = days.at(-1)
  if (!first || !last) return null

  const filteredIds = memberIds ? new Set(memberIds) : undefined
  const sortedPeople = [...people].sort((a, b) =>
    (a.fullName || a.email).localeCompare(b.fullName || b.email, 'es'),
  )
  const visiblePeople = sortedPeople.filter(
    (person) => !filteredIds || filteredIds.has(person.userId),
  )
  const availableTeams = teams
    .filter((team) => !team.archived || team.id === search.equipo)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const scope = search.persona
    ? { persona: search.persona }
    : search.equipo
      ? { equipo: search.equipo }
      : {}
  const calendarSearch = { vista: 'calendario', fecha: selectedDate } as const
  const managementLink =
    'text-primary rounded-sm font-medium underline decoration-from-font underline-offset-4'
  const activeScope = search.persona ? 'Por trabajador' : search.equipo ? 'Por equipo' : 'General'
  const moveWeek = (by: number) =>
    onSearchChange({ ...scope, ...calendarSearch, fecha: moveDays(selectedDate, by * 7) })

  return (
    <section aria-label="Calendario del equipo" className="min-w-0 space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">Calendario del equipo</h2>
          <Badge variant="neutral">{activeScope}</Badge>
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Consulta en un lugar los horarios previstos y las vacaciones u otras ausencias. Los
          horarios no son fichajes ni un histórico de turnos.
        </p>
      </header>

      <div className="border-border bg-card space-y-4 rounded-xl border p-3 sm:p-4">
        <fieldset className="flex flex-wrap items-end gap-3">
          <legend className="mb-2 text-sm font-semibold">Mostrar</legend>
          <Button
            variant={activeScope === 'General' ? 'default' : 'outline'}
            aria-pressed={activeScope === 'General'}
            onPress={() => onSearchChange(calendarSearch)}
          >
            General
          </Button>
          <label className="grid w-full min-w-0 gap-1 text-sm font-medium sm:w-auto sm:max-w-64">
            Por equipo
            <select
              className={controlClass}
              value={search.equipo ?? ''}
              onChange={(event) =>
                onSearchChange({
                  ...calendarSearch,
                  ...(event.target.value ? { equipo: event.target.value } : {}),
                })
              }
            >
              <option value="">Elegir equipo</option>
              {availableTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {workTeamLabel(team)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid w-full min-w-0 gap-1 text-sm font-medium sm:w-auto sm:max-w-64">
            Por trabajador
            <select
              className={controlClass}
              value={search.persona ?? ''}
              onChange={(event) =>
                onSearchChange({
                  ...calendarSearch,
                  ...(event.target.value ? { persona: event.target.value } : {}),
                })
              }
            >
              <option value="">Elegir trabajador</option>
              {sortedPeople.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.fullName || person.email}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <div className="border-border flex flex-wrap items-end gap-x-4 gap-y-3 border-t pt-3">
          <div className="mr-auto min-w-0 space-y-1">
            <h3 className="font-semibold" aria-live="polite">
              {dateLabel.formatRange(first.day, last.day)}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onPress={() => moveWeek(-1)}>
                Semana anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                onPress={() => onSearchChange({ ...scope, ...calendarSearch, fecha: today })}
              >
                Hoy
              </Button>
              <Button size="sm" variant="outline" onPress={() => moveWeek(1)}>
                Semana siguiente
              </Button>
            </div>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Ir a fecha
            <input
              className={controlClass}
              type="date"
              min="1000-01-01"
              max="9999-12-31"
              value={selectedDate}
              onChange={(event) => {
                if (event.target.value && event.target.validity.valid)
                  onSearchChange({ ...scope, ...calendarSearch, fecha: event.target.value })
              }}
            />
          </label>
        </div>
      </div>

      {visiblePeople.length ? (
        <TeamCalendarResults
          tenantId={tenantId}
          userId={userId}
          days={days}
          from={first.value}
          to={last.value}
          selectedDate={selectedDate}
          people={visiblePeople}
          onDayChange={(date) => onSearchChange({ ...scope, ...calendarSearch, fecha: date })}
        />
      ) : (
        <WorkerState
          title={search.equipo ? 'Este equipo no tiene personas' : 'No hay personas para mostrar'}
          description="Cuando haya personas en esta selección, verás sus horarios y ausencias aquí."
        />
      )}

      <nav aria-label="Gestionar planificación" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link
          to="/trabajadores"
          search={{ ...scope, vista: 'horarios' }}
          className={managementLink}
        >
          Gestionar horarios
        </Link>
        <Link
          to="/trabajadores"
          search={{ ...scope, vista: 'vacaciones' }}
          className={managementLink}
        >
          Gestionar vacaciones y ausencias
        </Link>
      </nav>
    </section>
  )
}

function TeamCalendarResults({
  tenantId,
  userId,
  days,
  from,
  to,
  selectedDate,
  people,
  onDayChange,
}: {
  tenantId: string
  userId: string
  days: ReturnType<typeof teamCalendarDays>
  from: string
  to: string
  selectedDate: string
  people: TeamMember[]
  onDayChange: (date: string) => void
}) {
  const scheduleOptions = staffSchedulesQuery(tenantId)
  const schedules = useQuery({
    ...scheduleOptions,
    queryKey: [...scheduleOptions.queryKey, userId],
  })
  const absences = useQuery(teamCalendarAbsencesQuery(tenantId, userId, from, to))

  if (schedules.isError || absences.isError)
    return (
      <WorkerState
        title="No se pudo cargar la planificación"
        description="No mostramos una disponibilidad parcial que pueda llevarte a error."
        error
        onRetry={() => {
          void schedules.refetch()
          void absences.refetch()
        }}
      />
    )
  if (schedules.isPending || absences.isPending)
    return <WorkerLoading label="Cargando horarios y ausencias de la semana…" />

  const schedulesByUser = new Map(
    schedules.data.map((schedule) => [schedule.userId, schedule.slots]),
  )
  const absencesByUser = new Map<string, TeamCalendarAbsence[]>()
  for (const absence of absences.data) {
    const items = absencesByUser.get(absence.userId) ?? []
    if (items.length === 0) absencesByUser.set(absence.userId, items)
    items.push(absence)
  }
  const rows = people.map((person) => ({
    userId: person.userId,
    name: person.fullName || person.email,
    cells: days.map(({ value, weekday }) =>
      teamCalendarCell(
        schedulesByUser.get(person.userId),
        absencesByUser.get(person.userId) ?? [],
        value,
        weekday,
      ),
    ),
  }))
  return (
    <TeamWeekGrid days={days} rows={rows} selectedDate={selectedDate} onDayChange={onDayChange} />
  )
}
