import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { CaretLeftIcon, CaretRightIcon, PlusIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { useSession } from '@/features/auth'
import {
  RelatedCreateButton,
  useRelatedRecordCreation,
} from '@/features/clients/ui/related-record-creation'
import {
  listApprovedVacationRanges,
  visitOverlapsVacation,
} from '@/features/vacations/application/vacation-actions'
import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import { workTeamsQuery } from '@/features/work-teams/application/work-team-actions'
import type { WorkPlanningSearch } from '@/shared/domain/work-planning-search'
import { dateValue } from '@/shared/lib/date-range'
import {
  calendarDays,
  calendarLocalInput,
  wallTimeNumber,
  type CalendarEvent,
  type CalendarEventChange,
} from '@/shared/lib/event-calendar'
import { useTenantData } from '@/shared/store/store'
import { CalendarDetailsDialog } from '@/shared/ui/calendar-details-dialog'
import { EventCalendar } from '@/shared/ui/event-calendar'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  createServiceVisit,
  listPlanningVisits,
  listTechnicians,
  type VisitPriority,
  type VisitSummary,
  type VisitStatus,
} from '../application/visit-actions'
import {
  calendarDateValue,
  calendarWeekLabel,
  calendarWeekRange,
  calendarMonthRange,
  moveCalendarMonth,
  toCalendarWallTime,
} from './agenda-calendar'
import type { AgendaPeriod, AgendaView } from './agenda-search'
import { BatchWorkSheets } from './batch-work-sheets'
import { PaperVisitPanel } from './paper-visit-panel'
import { VisitReplanForm } from './visit-replan-form'
import { VisitReportEditor } from './visit-report-editor'

const todayInMadrid = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

const statusLabels = {
  scheduled: 'Planificada',
  in_progress: 'En curso',
  completed: 'Completada',
  skipped: 'Omitida',
  canceled: 'Cancelada',
}

const statusStyles: Record<VisitStatus, { border: string; badge: string }> = {
  scheduled: { border: 'border-sky-500', badge: 'bg-sky-100 text-sky-900' },
  in_progress: { border: 'border-amber-500', badge: 'bg-amber-100 text-amber-900' },
  completed: { border: 'border-emerald-500', badge: 'bg-emerald-100 text-emerald-900' },
  skipped: { border: 'border-slate-400', badge: 'bg-slate-100 text-slate-700' },
  canceled: { border: 'border-rose-400', badge: 'bg-rose-100 text-rose-900' },
}

export function AgendaPage() {
  const { tenant, clients } = useTenantData()
  const session = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: '/trabajos' })
  const search = useSearch({ from: '/trabajos' })
  const date = search.date ?? todayInMadrid()
  const view: AgendaView = search.view ?? 'list'
  const period: AgendaPeriod = search.period ?? 'month'
  const filterTechnicianId = search.technician ?? ''
  const teamFilter = search.team ?? ''
  const statusFilter = search.status ?? ''
  const textFilter = search.q ?? ''
  const [selectedCalendarVisitId, setSelectedCalendarVisitId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [initialLocalStart, setInitialLocalStart] = useState(() => `${todayInMadrid()}T09:00`)
  const [clientId, setClientId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [title, setTitle] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [localStart, setLocalStart] = useState(initialLocalStart)
  const [duration, setDuration] = useState('60')
  const [priority, setPriority] = useState<VisitPriority>('normal')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [replanning, setReplanning] = useState<VisitSummary | null>(null)
  const [openReportId, setOpenReportId] = useState<string | null>(null)
  const operations = useRef(new Map<string, string>())
  const [calendarProposal, setCalendarProposal] = useState<CalendarEventChange | null>(null)
  const related = useRelatedRecordCreation({
    tenantId: tenant.id,
    clientId,
    onClientCreated: (id) => {
      setClientId(id)
      setLocationId('')
    },
    onLocationCreated: setLocationId,
  })
  const monthGrid =
    view === 'calendar' && period === 'month'
      ? calendarDays(calendarDateValue(date), 'month')
      : null
  const { from, to } = monthGrid
    ? {
        from: dateValue(monthGrid[0] ?? calendarDateValue(date)),
        to: dateValue(monthGrid.at(-1) ?? calendarDateValue(date)),
      }
    : period === 'month'
      ? calendarMonthRange(date)
      : period === 'week'
        ? calendarWeekRange(date)
        : { from: date, to: date }
  const queryPage = 'all'
  const queryKey = ['office-visits', tenant.id, from, to, filterTechnicianId, queryPage]
  const visits = useQuery({
    queryKey,
    queryFn: () =>
      listPlanningVisits(
        tenant.id,
        from,
        to,
        filterTechnicianId === 'unassigned' ? null : filterTechnicianId || null,
      ),
  })
  const teams = useQuery(workTeamsQuery(tenant.id))
  const visibleVisits = (visits.data ?? [])
    .filter(
      (visit) =>
        (!teamFilter ||
          (teamFilter === 'unassigned'
            ? !visit.work_team_id
            : visit.work_team_id === teamFilter)) &&
        (!statusFilter || visit.status === statusFilter) &&
        (filterTechnicianId !== 'unassigned' || (!visit.assigned_user_id && !visit.work_team_id)) &&
        `${visit.client_name} ${visit.location_name} ${visit.address} ${visit.title}`
          .toLocaleLowerCase('es')
          .includes(textFilter.trim().toLocaleLowerCase('es')),
    )
    .sort(
      (a, b) =>
        a.scheduled_start_at.slice(0, 10).localeCompare(b.scheduled_start_at.slice(0, 10)) ||
        (a.work_team_name || a.assigned_user_name || 'Sin asignar').localeCompare(
          b.work_team_name || b.assigned_user_name || 'Sin asignar',
        ) ||
        (a.route_order ?? 0) - (b.route_order ?? 0) ||
        a.scheduled_start_at.localeCompare(b.scheduled_start_at) ||
        a.id.localeCompare(b.id),
    )
  const approvedVacations = useQuery({
    queryKey: ['approved-vacations', tenant.id, from, to],
    enabled: session?.role === 'admin',
    queryFn: () => listApprovedVacationRanges(tenant.id, from, to),
  })
  const technicians = useQuery({
    queryKey: ['technicians', tenant.id],
    queryFn: () => listTechnicians(tenant.id),
  })
  const targets = useQuery({
    queryKey: ['work-target-options', tenant.id, clientId],
    enabled: Boolean(clientId) && !related.pending,
    queryFn: () => loadWorkTargetOptions(tenant.id, clientId),
  })
  const selectedLocation = targets.data?.locations.find((location) => location.id === locationId)
  const calendarItems: CalendarEvent[] = visibleVisits.map((visit) => ({
    id: visit.id,
    revision: visit.updated_at,
    title: visit.title,
    start: toCalendarWallTime(visit.scheduled_start_at, visit.timezone),
    end: toCalendarWallTime(visit.scheduled_end_at, visit.timezone),
    editable: session?.role === 'admin' && visit.status === 'scheduled',
    tone:
      visit.status === 'completed'
        ? 'success'
        : visit.status === 'canceled'
          ? 'muted'
          : visit.priority === 'urgent'
            ? 'danger'
            : 'primary',
    description: `${visit.client_name} · ${visit.timezone} · ${statusLabels[visit.status]}`,
  }))
  const calendarVisitById = new Map((visits.data ?? []).map((visit) => [visit.id, visit]))
  const selectedCalendarVisit = visibleVisits.find((visit) => visit.id === selectedCalendarVisitId)
  const timezone = selectedLocation?.timezone ?? 'Europe/Madrid'
  const durationMinutes = Number(duration)
  const validForm =
    Boolean(clientId) &&
    title.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localStart) &&
    Number.isInteger(durationMinutes) &&
    durationMinutes >= 15 &&
    durationMinutes <= 720
  const isDirty = Boolean(
    clientId ||
    locationId ||
    title ||
    assignedUserId ||
    localStart !== initialLocalStart ||
    duration !== '60' ||
    priority !== 'normal' ||
    notes,
  )

  function resetCreateForm() {
    const nextLocalStart = `${todayInMadrid()}T09:00`
    setInitialLocalStart(nextLocalStart)
    setClientId('')
    setLocationId('')
    setTitle('')
    setAssignedUserId('')
    setLocalStart(nextLocalStart)
    setDuration('60')
    setPriority('normal')
    setNotes('')
  }

  async function createVisit() {
    if (busy || related.pending || !validForm) return
    const payload = {
      tenantId: tenant.id,
      clientId,
      locationId: locationId || null,
      workOrderId: null,
      title: title.trim(),
      assignedUserId: assignedUserId || null,
      localStart,
      timezone,
      durationMinutes,
      priority,
      notes: notes.trim(),
    }
    const key = JSON.stringify(payload)
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await createServiceVisit({ ...payload, operationId })
      operations.current.delete(key)
      await queryClient.invalidateQueries({ queryKey: ['office-visits', tenant.id] })
      resetCreateForm()
      setCreateOpen(false)
      toast.success('Visita planificada')
    } catch (error) {
      toast.error('No se pudo planificar la visita', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  function updateSearch(update: WorkPlanningSearch) {
    setSelectedCalendarVisitId(null)
    void navigate({
      to: '/trabajos',
      search: (previous) => ({ ...previous, date, period, ...update }),
    })
  }

  function hasApprovedVacationConflict(visit: VisitSummary) {
    if (session?.role !== 'admin') return false
    return (approvedVacations.data ?? []).some((vacation) =>
      visitOverlapsVacation(
        {
          assignedUserId: visit.assigned_user_id ?? null,
          startAt: visit.scheduled_start_at,
          endAt: visit.scheduled_end_at,
          timezone: visit.timezone,
        },
        vacation,
      ),
    )
  }

  function renderVisitActions(visit: VisitSummary) {
    return (
      <div className="flex flex-wrap gap-2">
        {visit.status === 'scheduled' && session?.role === 'admin' ? (
          <Button
            variant="outline"
            onPress={() => {
              setCalendarProposal(null)
              setReplanning(visit)
            }}
          >
            Reprogramar
          </Button>
        ) : null}
        <Button
          variant="outline"
          onPress={() => setOpenReportId(openReportId === visit.id ? null : visit.id)}
        >
          {openReportId === visit.id ? 'Ocultar parte' : 'Ver parte'}
        </Button>
      </div>
    )
  }

  function renderVisitExpandedDetails(visit: VisitSummary) {
    return (
      <>
        {replanning?.id === visit.id ? (
          <VisitReplanForm
            key={`${visit.id}:${visit.updated_at}:${calendarProposal?.start.getTime()}:${calendarProposal?.end.getTime()}`}
            tenantId={tenant.id}
            visit={visit}
            technicians={technicians.data ?? []}
            proposal={
              calendarProposal?.item.id === visit.id
                ? {
                    localStart: calendarLocalInput(calendarProposal.start),
                    durationMinutes: Math.round(
                      (wallTimeNumber(calendarProposal.end) -
                        wallTimeNumber(calendarProposal.start)) /
                        60000,
                    ),
                  }
                : undefined
            }
            onDone={async () => {
              setReplanning(null)
              setCalendarProposal(null)
              await Promise.all(
                ['office-visits', 'my-visits', 'vacation-coverage', 'visit-report'].map((key) =>
                  queryClient.invalidateQueries({ queryKey: [key, tenant.id] }),
                ),
              )
            }}
            onCancel={() => {
              setReplanning(null)
              setCalendarProposal(null)
            }}
          />
        ) : null}
        {openReportId === visit.id && session?.userId ? (
          <div className="w-full">
            <PaperVisitPanel tenantId={tenant.id} visit={visit} />
            <VisitReportEditor
              key={`${session.userId}:${tenant.id}:${visit.id}`}
              visit={visit}
              tenantId={tenant.id}
              userId={session.userId}
            />
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Planificación</h2>
          <p className="text-muted-foreground text-sm">
            Organiza las visitas en lista o calendario.
          </p>
        </div>
        <Button onPress={() => setCreateOpen(true)}>
          <PlusIcon aria-hidden="true" />
          Nueva visita
        </Button>
      </div>
      <FormDialog
        open={createOpen && !related.creating}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) resetCreateForm()
        }}
        title="Nueva visita"
        submitLabel={busy ? 'Guardando…' : 'Planificar visita'}
        submitDisabled={related.pending || !validForm || !session?.tenantId}
        isSubmitting={busy}
        isDirty={isDirty}
        onSubmit={() => void createVisit()}
      >
        {related.status}
        <div className="flex flex-col gap-1.5">
          <SelectField
            label="Cliente"
            value={clientId}
            options={[
              { value: '', label: 'Selecciona un cliente' },
              ...clients.map((client) => ({ value: client.id, label: client.name })),
            ]}
            onChange={(value) => {
              setClientId(value)
              setLocationId('')
            }}
          />
          {related.allowed ? (
            <RelatedCreateButton label="Crear cliente" onPress={() => related.start('client')} />
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <SelectField
            label="Centro"
            value={locationId}
            options={[
              { value: '', label: 'Sin ubicación' },
              ...(targets.data?.locations ?? []).map((location) => ({
                value: location.id,
                label: location.name,
              })),
            ]}
            onChange={setLocationId}
          />
          {related.allowed && clientId ? (
            <RelatedCreateButton
              label="Crear centro"
              disabled={related.pending}
              onPress={() => related.start('location')}
            />
          ) : null}
        </div>
        <SelectField
          label="Técnico"
          value={assignedUserId}
          options={[
            { value: '', label: 'Pendiente de asignar' },
            ...(technicians.data ?? []).map((person) => ({
              value: person.id,
              label: person.label,
            })),
          ]}
          onChange={setAssignedUserId}
        />
        <TextField
          label="Asunto"
          value={title}
          onChange={setTitle}
          placeholder="Ejemplo: cristales del centro"
          maxLength={200}
          className="sm:col-span-2"
        />
        <TextField
          label="Inicio local"
          type="datetime-local"
          value={localStart}
          onChange={setLocalStart}
          placeholder="Fecha y hora"
          helper={`Zona horaria: ${timezone}`}
        />
        <TextField
          label="Duración estimada (minutos)"
          type="number"
          value={duration}
          onChange={setDuration}
          min={15}
          max={720}
          placeholder="120"
        />
        <SelectField
          label="Prioridad"
          value={priority}
          options={[
            { value: 'low', label: 'Baja' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'Alta' },
            { value: 'urgent', label: 'Urgente' },
          ]}
          onChange={(value) => setPriority(value as VisitPriority)}
        />
        <TextField
          label="Indicaciones"
          value={notes}
          onChange={setNotes}
          placeholder="Instrucciones necesarias para la visita"
          maxLength={2000}
          className="sm:col-span-2"
        />
      </FormDialog>
      {related.dialogs}

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>
                {view === 'calendar' ? 'Calendario de trabajos' : 'Lista de trabajos'}
              </CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                {period === 'month'
                  ? new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', {
                      month: 'long',
                      year: 'numeric',
                    })
                  : period === 'week'
                    ? calendarWeekLabel(date)
                    : new Date(`${date}T12:00:00`).toLocaleDateString('es-ES')}
              </p>
            </div>
            <fieldset className="inline-flex rounded-lg border p-1">
              <legend className="sr-only">Cambiar vista de trabajos</legend>
              {(['list', 'calendar'] as const).map((nextView) => (
                <Button
                  key={nextView}
                  variant={view === nextView ? 'default' : 'ghost'}
                  aria-pressed={view === nextView}
                  onPress={() => {
                    setSelectedCalendarVisitId(null)
                    updateSearch({ view: nextView })
                  }}
                >
                  {nextView === 'list' ? 'Lista' : 'Calendario'}
                </Button>
              ))}
            </fieldset>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full min-w-0 sm:w-44">
              <TextField
                label="Fecha de referencia"
                type="date"
                value={date}
                onChange={(value) => {
                  if (value) {
                    setSelectedCalendarVisitId(null)
                    updateSearch({ date: value })
                  }
                }}
                placeholder="Fecha"
              />
            </div>
            <div className="w-32">
              <SelectField
                label="Periodo"
                value={period}
                options={[
                  { value: 'day', label: 'Día' },
                  { value: 'week', label: 'Semana' },
                  { value: 'month', label: 'Mes' },
                ]}
                onChange={(value) => {
                  updateSearch({ period: value as AgendaPeriod })
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="size-8 p-0"
                aria-label="Periodo anterior"
                onPress={() => {
                  setSelectedCalendarVisitId(null)
                  updateSearch({
                    date:
                      period === 'month'
                        ? moveCalendarMonth(date, -1)
                        : addDays(date, period === 'day' ? -1 : -7),
                  })
                }}
              >
                <CaretLeftIcon aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onPress={() => {
                  setSelectedCalendarVisitId(null)
                  updateSearch({ date: todayInMadrid() })
                }}
              >
                Hoy
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="size-8 p-0"
                aria-label="Periodo siguiente"
                onPress={() => {
                  setSelectedCalendarVisitId(null)
                  updateSearch({
                    date:
                      period === 'month'
                        ? moveCalendarMonth(date, 1)
                        : addDays(date, period === 'day' ? 1 : 7),
                  })
                }}
              >
                <CaretRightIcon aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Técnico"
              value={filterTechnicianId}
              options={[
                { value: '', label: 'Todos' },
                { value: 'unassigned', label: 'Sin persona ni equipo' },
                ...(technicians.data ?? []).map((person) => ({
                  value: person.id,
                  label: person.label,
                })),
              ]}
              onChange={(value) => {
                updateSearch({ technician: value || undefined })
              }}
            />
            <SelectField
              label="Equipo"
              value={teamFilter}
              onChange={(value) => updateSearch({ team: value || undefined })}
              options={[
                { value: '', label: 'Todos los equipos' },
                { value: 'unassigned', label: 'Sin equipo' },
                ...(teams.data ?? []).map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
            <SelectField
              label="Estado"
              value={statusFilter}
              onChange={(value) =>
                updateSearch({ status: (value || undefined) as WorkPlanningSearch['status'] })
              }
              options={[
                { value: '', label: 'Todos los estados' },
                ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
              ]}
            />
            <TextField
              label="Buscar cliente o centro"
              value={textFilter}
              onChange={(value) => updateSearch({ q: value || undefined })}
              placeholder="Nombre o dirección"
            />
          </div>
          {filterTechnicianId || teamFilter || statusFilter || textFilter ? (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onPress={() =>
                  updateSearch({
                    technician: undefined,
                    team: undefined,
                    status: undefined,
                    q: undefined,
                  })
                }
              >
                Limpiar filtros
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {visibleVisits.length} trabajos planificados ·{' '}
            {Math.round(
              visibleVisits
                .filter((v) => v.status !== 'canceled' && v.status !== 'skipped')
                .reduce(
                  (total, v) =>
                    total +
                    (Date.parse(v.scheduled_end_at) - Date.parse(v.scheduled_start_at)) / 60000,
                  0,
                ),
            )}{' '}
            minutos estimados (no equivale a trabajo realizado)
          </p>
          {view === 'list' && period === 'day' ? (
            <BatchWorkSheets
              tenantId={tenant.id}
              visits={visibleVisits.filter(
                (v) => v.status !== 'canceled' && v.status !== 'skipped',
              )}
            />
          ) : null}
          {visits.isPending ? <output>Cargando trabajos…</output> : null}
          {visits.isError ? (
            <p role="alert" className="text-destructive text-sm">
              No se pudieron cargar los trabajos: {visits.error.message}
            </p>
          ) : null}
          {approvedVacations.isError ? (
            <p role="alert" className="text-destructive text-sm">
              No se pudieron comprobar las vacaciones aprobadas: {approvedVacations.error.message}
            </p>
          ) : null}

          {view === 'calendar' ? (
            <>
              {!visits.isPending && !visits.isError && visibleVisits.length === 0 ? (
                <output className="text-muted-foreground text-sm">
                  No hay trabajos en este periodo con estos filtros. Puedes elegir otra fecha.
                </output>
              ) : null}
              <EventCalendar
                key={`${period}:${date}`}
                aria-label={
                  period === 'month'
                    ? 'Calendario mensual de trabajos'
                    : period === 'day'
                      ? 'Calendario diario de trabajos'
                      : 'Calendario semanal de trabajos'
                }
                view={period}
                value={calendarDateValue(date)}
                items={calendarItems}
                minuteStep={15}
                onDayClick={(day) =>
                  updateSearch({ date: calendarLocalInput(day).slice(0, 10), period: 'day' })
                }
                onItemClick={(item) => {
                  setSelectedCalendarVisitId(item.id)
                  setOpenReportId(null)
                  setReplanning(null)
                  setCalendarProposal(null)
                }}
                onItemChange={
                  session?.role === 'admin'
                    ? (change) => {
                        const visit = calendarVisitById.get(change.item.id)
                        if (!visit || visit.status !== 'scheduled') return
                        if (visit.updated_at !== change.item.revision) {
                          toast.error(
                            'El trabajo ha cambiado. Revisa los datos antes de reprogramar.',
                          )
                          return
                        }
                        setSelectedCalendarVisitId(visit.id)
                        setOpenReportId(null)
                        setReplanning(visit)
                        setCalendarProposal(change)
                      }
                    : undefined
                }
                renderItem={(item) => {
                  const visit = calendarVisitById.get(item.id)
                  if (!visit) return typeof item.title === 'string' ? item.title : item.id
                  return (
                    <span
                      className={`grid gap-1 border-l-2 pl-2 ${statusStyles[visit.status].border}`}
                    >
                      <span className="truncate font-semibold">{visit.title}</span>
                      <span className="truncate text-xs opacity-80">
                        {visit.client_name} ·{' '}
                        {new Intl.DateTimeFormat('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(item.start)}
                      </span>
                      <span className="truncate text-xs opacity-80">
                        {visit.work_team_name || visit.assigned_user_name || 'Pendiente de asignar'}
                        {visit.priority === 'urgent' ? ' · Urgente' : ''}
                      </span>
                      <span
                        className={`w-fit rounded-full px-1.5 py-0.5 text-[10px] ${statusStyles[visit.status].badge}`}
                      >
                        {statusLabels[visit.status]}
                      </span>
                    </span>
                  )
                }}
              />
              {selectedCalendarVisit ? (
                <CalendarDetailsDialog
                  title={selectedCalendarVisit.title}
                  description={`Detalle del trabajo · ${selectedCalendarVisit.timezone}`}
                  onClose={() => {
                    setSelectedCalendarVisitId(null)
                    setReplanning(null)
                    setCalendarProposal(null)
                    setOpenReportId(null)
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{selectedCalendarVisit.title}</h3>
                      <p className="text-muted-foreground text-sm">
                        {new Date(selectedCalendarVisit.scheduled_start_at).toLocaleString(
                          'es-ES',
                          {
                            timeZone: selectedCalendarVisit.timezone,
                            dateStyle: 'full',
                            timeStyle: 'short',
                          },
                        )}{' '}
                        · {selectedCalendarVisit.client_name}
                        {selectedCalendarVisit.location_name
                          ? ` · ${selectedCalendarVisit.location_name}`
                          : ''}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {selectedCalendarVisit.work_team_name ||
                          selectedCalendarVisit.assigned_user_name ||
                          'Pendiente de asignar'}{' '}
                        · {statusLabels[selectedCalendarVisit.status]}
                        {selectedCalendarVisit.priority === 'urgent' ? ' · Urgente' : ''}
                      </p>
                      {hasApprovedVacationConflict(selectedCalendarVisit) ? (
                        <p className="text-destructive text-sm font-medium">
                          Vacaciones aprobadas · revisar cobertura en{' '}
                          <Link to="/vacaciones" className="underline">
                            Vacaciones
                          </Link>
                        </p>
                      ) : null}
                    </div>
                    {renderVisitActions(selectedCalendarVisit)}
                  </div>
                  {renderVisitExpandedDetails(selectedCalendarVisit)}
                </CalendarDetailsDialog>
              ) : null}
            </>
          ) : (
            <>
              {!visits.isPending && !visits.isError && visibleVisits.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No hay trabajos en este periodo con estos filtros.
                </p>
              ) : null}
              <ol className="divide-border divide-y">
                {visibleVisits.map((visit, index) => (
                  <li key={visit.id} className="space-y-3 py-4 text-sm">
                    {index === 0 ||
                    (visibleVisits[index - 1]?.work_team_id ??
                      visibleVisits[index - 1]?.assigned_user_id) !==
                      (visit.work_team_id ?? visit.assigned_user_id) ||
                    visibleVisits[index - 1]?.scheduled_start_at.slice(0, 10) !==
                      visit.scheduled_start_at.slice(0, 10) ? (
                      <h3 className="text-primary font-semibold">
                        {visit.work_team_name || visit.assigned_user_name || 'Sin asignar'} ·{' '}
                        {new Date(visit.scheduled_start_at).toLocaleDateString('es-ES', {
                          timeZone: visit.timezone,
                        })}
                      </h3>
                    ) : null}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{visit.title}</p>
                        {hasApprovedVacationConflict(visit) ? (
                          <p className="text-destructive font-medium">
                            Vacaciones aprobadas · revisar cobertura en{' '}
                            <Link to="/vacaciones" className="underline">
                              Vacaciones
                            </Link>
                          </p>
                        ) : null}
                        <p className="text-muted-foreground">
                          {new Date(visit.scheduled_start_at).toLocaleString('es-ES', {
                            timeZone: visit.timezone,
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}{' '}
                          · {visit.client_name}
                          {visit.location_name ? ` · ${visit.location_name}` : ''}
                        </p>
                        <p className="text-muted-foreground">
                          {visit.work_team_name ||
                            visit.assigned_user_name ||
                            'Pendiente de asignar'}{' '}
                          · Orden {visit.route_order ?? 0} · {statusLabels[visit.status]}
                          {visit.priority === 'urgent' ? ' · Urgente' : ''}
                        </p>
                      </div>
                      {renderVisitActions(visit)}
                    </div>
                    {renderVisitExpandedDetails(visit)}
                  </li>
                ))}
              </ol>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
