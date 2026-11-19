import { Button, toast } from '@doscientos/ui'
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
  calendarTime,
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
  replanServiceVisit,
  type VisitPriority,
  type VisitSummary,
  type VisitStatus,
} from '../application/visit-actions'
import {
  calendarDateValue,
  calendarWeekRange,
  calendarMonthRange,
  toCalendarWallTime,
} from './agenda-calendar'
import type { AgendaPeriod, AgendaView } from './agenda-search'
import { BatchWorkSheets } from './batch-work-sheets'
import { PaperVisitPanel } from './paper-visit-panel'
import { PlanningToolbar } from './planning-toolbar'
import { VisitReplanForm } from './visit-replan-form'
import { VisitReportEditor } from './visit-report-editor'

import './planning-calendar.css'

const todayInMadrid = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

const statusLabels = {
  scheduled: 'Planificada',
  in_progress: 'En curso',
  completed: 'Completada',
  skipped: 'Omitida',
  canceled: 'Cancelada',
}

const statusTones: Record<VisitStatus, NonNullable<CalendarEvent['tone']>> = {
  scheduled: 'primary',
  in_progress: 'warning',
  completed: 'success',
  skipped: 'muted',
  canceled: 'muted',
}

const planningDayLabel = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' })
const replannedStartLabel = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function AgendaPage() {
  const { tenant, clients } = useTenantData()
  const session = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: '/trabajos' })
  const search = useSearch({ from: '/trabajos' })
  const today = todayInMadrid()
  const date = search.date ?? today
  const view: AgendaView = search.view ?? 'calendar'
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
  const [pendingChanges, setPendingChanges] = useState<Record<string, CalendarEventChange>>({})
  const moving = useRef(new Set<string>())
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
        `${visit.client_name} ${visit.location_name} ${visit.address} ${visit.title} ${visit.contract_title ?? ''}`
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
  const calendarVisitById = new Map(visibleVisits.map((visit) => [visit.id, visit]))
  const canReplan = session?.role === 'admin'
  const calendarItems: CalendarEvent[] = visibleVisits.map((visit) => {
    const pending = pendingChanges[visit.id]
    return {
      id: visit.id,
      revision: visit.updated_at,
      title: visit.title,
      start: pending?.start ?? toCalendarWallTime(visit.scheduled_start_at, visit.timezone),
      end: pending?.end ?? toCalendarWallTime(visit.scheduled_end_at, visit.timezone),
      editable: canReplan && visit.status === 'scheduled' && !pending,
      resizable: period !== 'month',
      tone:
        visit.priority === 'urgent' && visit.status === 'scheduled'
          ? 'danger'
          : statusTones[visit.status],
      description: `${visit.client_name} · ${statusLabels[visit.status]}${pending ? ' · Guardando' : ''}`,
    }
  })
  const selectedCalendarVisit = selectedCalendarVisitId
    ? calendarVisitById.get(selectedCalendarVisitId)
    : undefined
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

  function updateSearch(update: WorkPlanningSearch, replace = false) {
    setSelectedCalendarVisitId(null)
    setReplanning(null)
    setOpenReportId(null)
    void navigate({
      to: '/trabajos',
      search: (previous) => ({ ...previous, date, period, ...update }),
      replace,
    })
  }

  async function refreshReplannedVisits() {
    await Promise.all(
      ['office-visits', 'my-visits', 'vacation-coverage', 'visit-report'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key, tenant.id] }),
      ),
    )
  }

  async function saveCalendarChange(change: CalendarEventChange) {
    const visit = calendarVisitById.get(change.item.id)
    if (!canReplan || !visit || visit.status !== 'scheduled' || moving.current.has(visit.id)) return
    if (visit.updated_at !== change.item.revision) {
      toast.error('El trabajo ha cambiado. Revisa el calendario antes de moverlo.')
      return
    }
    const durationMinutes = Math.round(
      (change.kind === 'move'
        ? Date.parse(visit.scheduled_end_at) - Date.parse(visit.scheduled_start_at)
        : wallTimeNumber(change.end) - wallTimeNumber(change.start)) / 60_000,
    )
    if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) {
      toast.error('El trabajo debe durar entre 15 minutos y 12 horas.')
      return
    }
    const payload = {
      tenantId: tenant.id,
      visitId: visit.id,
      expectedUpdatedAt: visit.updated_at,
      localStart: calendarLocalInput(change.start),
      durationMinutes,
      assignedUserId: visit.assigned_user_id ?? null,
      reason:
        change.kind === 'move'
          ? 'Cambio de fecha u hora desde el calendario'
          : 'Cambio de duración desde el calendario',
    }
    const key = JSON.stringify(payload)
    const operationId = operations.current.get(key) ?? crypto.randomUUID()
    operations.current.set(key, operationId)
    moving.current.add(visit.id)
    setPendingChanges((previous) => ({ ...previous, [visit.id]: change }))
    try {
      await replanServiceVisit({ ...payload, operationId })
      operations.current.delete(key)
      await refreshReplannedVisits()
      toast.success('Trabajo reprogramado', {
        description: replannedStartLabel.format(change.start),
      })
    } catch (error) {
      toast.error('No se pudo reprogramar el trabajo', {
        description: error instanceof Error ? error.message : 'Vuelve a intentarlo.',
      })
      await queryClient.invalidateQueries({ queryKey: ['office-visits', tenant.id] })
    } finally {
      moving.current.delete(visit.id)
      setPendingChanges((previous) => {
        const next = { ...previous }
        delete next[visit.id]
        return next
      })
    }
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
        {visit.status === 'scheduled' && canReplan ? (
          <Button
            variant="outline"
            isDisabled={Boolean(pendingChanges[visit.id])}
            onPress={() => setReplanning(visit)}
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
            key={`${visit.id}:${visit.updated_at}`}
            tenantId={tenant.id}
            visit={visit}
            technicians={technicians.data ?? []}
            onDone={async () => {
              setReplanning(null)
              await refreshReplannedVisits()
            }}
            onCancel={() => setReplanning(null)}
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

      <PlanningToolbar
        date={date}
        today={today}
        period={period}
        view={view}
        filters={search}
        technicians={technicians.data ?? []}
        teams={teams.data ?? []}
        statusLabels={statusLabels}
        count={visits.isSuccess ? visibleVisits.length : undefined}
        onChange={updateSearch}
        onCreate={() => setCreateOpen(true)}
      />
      <div className="space-y-4">
        {view === 'list' && period === 'day' ? (
          <BatchWorkSheets
            tenantId={tenant.id}
            visits={visibleVisits.filter((v) => v.status !== 'canceled' && v.status !== 'skipped')}
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
            {canReplan && calendarItems.some((item) => item.editable) ? (
              <p className="text-muted-foreground text-xs">
                {period === 'month'
                  ? 'Arrastra a otro día para conservar la hora. Pulsa una fecha para ajustar la hora en su horario.'
                  : period === 'day'
                    ? 'Arrastra a otra hora o suelta el trabajo en Día anterior o Día siguiente.'
                    : 'Arrastra a otra hora o columna. El cambio se guarda al soltar.'}
              </p>
            ) : null}
            <div className="planning-calendar" data-period={period}>
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
                showInstructions={false}
                showAllDay={false}
                dayMoveTargets={canReplan}
                compactEmptyHours
                renderDayLabel={(day) =>
                  period === 'month' ? day.getDate() : planningDayLabel.format(day)
                }
                onDayClick={(day) => updateSearch({ date: dateValue(day), period: 'day' })}
                onItemClick={(item) => {
                  setSelectedCalendarVisitId(item.id)
                  setOpenReportId(null)
                  setReplanning(null)
                }}
                onItemChange={canReplan ? (change) => void saveCalendarChange(change) : undefined}
                renderItem={(item) => {
                  const visit = calendarVisitById.get(item.id)
                  return (
                    <span className="planning-calendar__entry">
                      <span className="planning-calendar__entry-line">
                        <span className="planning-calendar__entry-time">
                          {calendarTime(item.start)}
                        </span>
                        <span className="truncate font-medium">{item.title}</span>
                      </span>
                      <span className="block truncate opacity-80">
                        {visit && pendingChanges[item.id]
                          ? 'Guardando…'
                          : visit &&
                            [
                              visit.client_name,
                              visit.work_team_name || visit.assigned_user_name || 'Sin asignar',
                              statusLabels[visit.status],
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                      </span>
                    </span>
                  )
                }}
              />
            </div>
            {visits.isSuccess && !visibleVisits.length ? (
              <p className="text-muted-foreground text-xs">
                No hay trabajos en este periodo con estos filtros.
              </p>
            ) : null}
            {selectedCalendarVisit ? (
              <CalendarDetailsDialog
                title={selectedCalendarVisit.title}
                description={`Detalle del trabajo · ${selectedCalendarVisit.timezone}`}
                onClose={() => {
                  setSelectedCalendarVisitId(null)
                  setReplanning(null)
                  setOpenReportId(null)
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{selectedCalendarVisit.title}</h3>
                    <p className="text-muted-foreground text-sm">
                      {new Date(selectedCalendarVisit.scheduled_start_at).toLocaleString('es-ES', {
                        timeZone: selectedCalendarVisit.timezone,
                        dateStyle: 'full',
                        timeStyle: 'short',
                      })}{' '}
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
                        {visit.work_team_name || visit.assigned_user_name || 'Pendiente de asignar'}{' '}
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
      </div>
    </div>
  )
}
