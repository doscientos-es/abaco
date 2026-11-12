import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useSession } from '@/features/auth'
import { teamQuery } from '@/features/settings/application/team-actions'
import { workTeamsQuery } from '@/features/work-teams'
import { dateValue } from '@/shared/lib/date-range'
import { calendarDays, calendarTime, type EventCalendarView } from '@/shared/lib/event-calendar'
import { CalendarToolbar } from '@/shared/ui/calendar-toolbar'
import { EventCalendar } from '@/shared/ui/event-calendar'

import {
  staffAbsencesQuery,
  staffFunctionsQuery,
  staffSchedulesQuery,
} from '../application/staff-schedule-actions'
import { scheduleOccurrences, type StaffPerson } from '../domain/staff-schedule'
import { selectedStaffIds, type StaffSelection } from '../domain/staff-selection'
import { StaffPeopleFilter } from './staff-people-filter'
import { StaffScheduleEditor } from './staff-schedule-editor'

export function StaffSchedulesPage() {
  const session = useSession()
  if (!session?.tenantId || !session.userId) return <p>Selecciona una empresa.</p>
  return (
    <ScheduleView
      key={`${session.tenantId}:${session.userId}`}
      tenantId={session.tenantId}
      userId={session.userId}
      name={session.fullName || session.email || 'Mi horario'}
      admin={session.role === 'admin'}
    />
  )
}

function ScheduleView({
  tenantId,
  userId,
  name,
  admin,
}: {
  tenantId: string
  userId: string
  name: string
  admin: boolean
}) {
  const [date, setDate] = useState(() => new Date())
  const [view, setView] = useState<EventCalendarView>('week')
  const [selected, setSelected] = useState<StaffSelection>({ personIds: [], teamIds: [] })
  const [functionFilter, setFunctionFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [itemId, setItemId] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const days = calendarDays(date, view)
  const from = dateValue(days[0] ?? date)
  const to = dateValue(days[days.length - 1] ?? date)
  const scheduleOptions = staffSchedulesQuery(tenantId)
  const functionOptions = staffFunctionsQuery(tenantId)
  const absenceOptions = staffAbsencesQuery(tenantId, from, to)
  const schedules = useQuery({
    ...scheduleOptions,
    queryKey: [...scheduleOptions.queryKey, userId],
  })
  const functions = useQuery({
    ...functionOptions,
    queryKey: [...functionOptions.queryKey, userId],
  })
  const absences = useQuery({ ...absenceOptions, queryKey: [...absenceOptions.queryKey, userId] })
  const team = useQuery({ ...teamQuery(tenantId), enabled: admin })
  const workTeams = useQuery({ ...workTeamsQuery(tenantId), enabled: admin })
  const loading =
    schedules.isPending ||
    functions.isPending ||
    absences.isPending ||
    (admin && (team.isPending || workTeams.isPending))
  const failed =
    schedules.isError ||
    functions.isError ||
    absences.isError ||
    (admin && (team.isError || workTeams.isError))
  const schedulesByUser = new Map(schedules.data?.map((schedule) => [schedule.userId, schedule]))
  const people: StaffPerson[] = (
    admin
      ? (team.data ?? []).map((member) => ({
          userId: member.userId,
          name: member.fullName || member.email,
          email: member.email,
        }))
      : [{ userId, name }]
  ).map((person) => ({
    ...person,
    schedule: schedulesByUser.get(person.userId) ?? null,
  }))
  const memberIds = new Set(people.map((person) => person.userId))
  const availableTeams = (workTeams.data ?? [])
    .filter((group) => !group.archived)
    .map((group) => ({ ...group, memberIds: group.memberIds.filter((id) => memberIds.has(id)) }))
    .filter((group) => group.memberIds.length > 0)
  const selectedIds = selectedStaffIds(people, availableTeams, selected)
  const visible = people.filter(
    (person) =>
      (!admin || selectedIds.has(person.userId)) &&
      (!functionFilter || person.schedule?.functionIds.includes(functionFilter)),
  )
  const occurrences = scheduleOccurrences(visible, absences.data ?? [], date, view)
  const activeNow = [
    ...new Map(
      occurrences
        .filter((item) => item.start <= now && item.end > now)
        .map((item) => [item.userId, item.name]),
    ).values(),
  ]
  const selectedItem = occurrences.find((item) => item.id === itemId)
  const editing = people.find((person) => person.userId === editingId)
  const events = occurrences.map((item) => ({
    id: item.id,
    title: item.name,
    start: item.start,
    end: item.end,
  }))

  async function download() {
    setExporting(true)
    setPdfError('')
    try {
      const { downloadSchedulePdf } = await import('./staff-schedule-pdf')
      await downloadSchedulePdf(
        date,
        view,
        occurrences,
        admin ? 'Horario del equipo' : `Horario de ${name}`,
      )
    } catch {
      setPdfError('No se pudo generar el PDF. Inténtalo de nuevo.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{admin ? 'Horarios del equipo' : 'Mi horario'}</h1>
        <p className="text-muted-foreground text-sm">
          Semana tipo actual, no presencia real ni historial de horarios. Se excluyen las ausencias
          aprobadas.
        </p>
      </header>
      {loading ? (
        <p>Cargando horarios…</p>
      ) : failed ? (
        <div role="alert">
          No se pudieron cargar los horarios, los equipos o las ausencias.{' '}
          <Button
            variant="outline"
            onPress={() => {
              void schedules.refetch()
              void functions.refetch()
              void absences.refetch()
              if (admin) {
                void team.refetch()
                void workTeams.refetch()
              }
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          {admin ? (
            <section
              className="flex flex-wrap items-center gap-2"
              aria-label="Filtrar trabajadores"
            >
              <StaffPeopleFilter
                people={people}
                teams={availableTeams}
                selected={selected}
                onChange={setSelected}
                onEdit={setEditingId}
              />
              <select
                aria-label="Filtrar por función"
                className="border-border bg-background h-9 rounded-lg border px-3 text-sm"
                value={functionFilter}
                onChange={(event) => setFunctionFilter(event.target.value)}
              >
                <option value="">Todas las funciones</option>
                {(functions.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </section>
          ) : (
            <p className="text-sm">
              <strong>Mis funciones:</strong>{' '}
              {(functions.data ?? []).map((item) => item.name).join(', ') ||
                'Sin funciones asignadas'}
            </p>
          )}
          {editing ? (
            <StaffScheduleEditor
              key={editing.userId}
              tenantId={tenantId}
              person={editing}
              functions={functions.data ?? []}
              onClose={() => setEditingId(null)}
            />
          ) : null}
          {admin && visible.length > 0 && from <= dateValue(now) && dateValue(now) <= to ? (
            <p className="text-sm" aria-live="polite">
              <strong>Previstos ahora:</strong>{' '}
              {activeNow.length ? activeNow.join(', ') : 'ninguna persona'}.
            </p>
          ) : null}
          {visible.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Calendario</h2>
                <Button
                  variant="outline"
                  isDisabled={exporting || !occurrences.length}
                  onPress={() => void download()}
                >
                  {exporting ? 'Generando PDF…' : 'Descargar PDF'}
                </Button>
              </div>
              {pdfError ? <p role="alert">{pdfError}</p> : null}
              <CalendarToolbar
                value={date}
                view={view}
                onDateChange={setDate}
                onViewChange={setView}
              />
              <EventCalendar
                key={`${view}:${from}`}
                value={date}
                view={view}
                items={events}
                showInstructions={false}
                showAllDay={false}
                renderDaySummary={(day) => {
                  const count = new Set(
                    occurrences
                      .filter((item) => item.date === dateValue(day))
                      .map((item) => item.userId),
                  ).size
                  return count ? (
                    <span className="text-muted-foreground text-xs">
                      {count} {count === 1 ? 'persona' : 'personas'}
                    </span>
                  ) : null
                }}
                aria-label="Calendario de horarios previstos"
                onItemClick={(item) => setItemId(item.id)}
                onDayClick={(day) => {
                  setDate(day)
                  setView('day')
                }}
              />
            </>
          ) : null}
          {selectedItem ? (
            <output className="text-sm">
              {selectedItem.name}: {selectedItem.date}, {calendarTime(selectedItem.start)}–
              {calendarTime(selectedItem.end)}
            </output>
          ) : null}
          {admin && selectedIds.size === 0 ? (
            <p className="text-muted-foreground text-sm">
              Selecciona personas o equipos en el buscador para mostrar el calendario.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay personas de la selección con esta función.
            </p>
          ) : !occurrences.length ? (
            <p className="text-muted-foreground text-sm">
              No hay franjas previstas para este período y selección.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
