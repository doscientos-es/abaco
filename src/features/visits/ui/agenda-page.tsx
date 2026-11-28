import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'

import { useSession } from '@/features/auth'
import {
  RelatedCreateButton,
  useRelatedRecordCreation,
} from '@/features/clients/ui/related-record-creation'
import { staffAbsencesQuery } from '@/features/staff-schedules/application/staff-schedule-actions'
import { visitOverlapsVacation } from '@/features/vacations/application/vacation-actions'
import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import { workTeamsQuery } from '@/features/work-teams/application/work-team-actions'
import type { WorkPlanningSearch } from '@/shared/domain/work-planning-search'
import {
  calendarDate,
  dateValue,
  monthDateRange,
  moveDays,
  todayInMadrid,
} from '@/shared/lib/date-range'
import {
  calendarLocalInput,
  calendarTime,
  calendarVisibleRange,
  wallTimeNumber,
  type CalendarEvent,
  type CalendarEventChange,
} from '@/shared/lib/event-calendar'
import { useTenantData } from '@/shared/store/store'
import { CalendarDetailsDialog } from '@/shared/ui/calendar-details-dialog'
import { VisitMapsAction } from '@/shared/ui/contact-actions'
import { EventCalendar } from '@/shared/ui/event-calendar'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  createServiceVisit,
  listPlanningVisits,
  listTechnicians,
  replanServiceVisit,
  replanContractDay,
  type VisitPriority,
  type VisitSummary,
  type VisitStatus,
} from '../application/visit-actions'
import { dailyTravelRoutes } from '../domain/agenda-travel-review'
import { toCalendarWallTime } from './agenda-calendar'
import { AgendaResolutionPanel } from './agenda-resolution-panel'
import type { AgendaPeriod, AgendaView } from './agenda-search'
import { AgendaTravelReview } from './agenda-travel-review'
import { AppointmentChangeInbox } from './appointment-change-inbox'
import { AppointmentLinkManager } from './appointment-link-manager'
import { BatchVisitReplan } from './batch-visit-replan'
import { BatchWorkSheets } from './batch-work-sheets'
import { PaperVisitPanel } from './paper-visit-panel'
import { PlanningToolbar } from './planning-toolbar'
import { groupVisitsByContractDay } from './visit-calendar-groups'
import { VisitOccurrenceReference } from './visit-occurrence-scope'
import { VisitOccurrenceSkipForm } from './visit-occurrence-skip-form'
import { VisitReplanForm } from './visit-replan-form'
import { VisitReportEditor } from './visit-report-editor'
import { VisitSwapsPanel } from './visit-swaps-panel'

import './planning-calendar.css'

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
  const [skipVisitId, setSkipVisitId] = useState<string | null>(null)
  const [savingOccurrence, setSavingOccurrence] = useState(false)
  const skipTrigger = useRef<HTMLElement | null>(null)
  const moving = useRef(new Set<string>())
  const [appointmentVisitId, setAppointmentVisitId] = useState<string | null>(null)
  const related = useRelatedRecordCreation({
    tenantId: tenant.id,
    clientId,
    onClientCreated: (id) => {
      setClientId(id)
      setLocationId('')
    },
    onLocationCreated: setLocationId,
  })
  const calendarAnchor = calendarDate(date)
  const { from, to } =
    view === 'list' && period === 'month'
      ? monthDateRange(date)
      : calendarVisibleRange(calendarAnchor, period)
  const queryPage = 'all'
  const queryKey = ['office-visits', tenant.id, from, to, filterTechnicianId, queryPage]
  const visits = useQuery({
    queryKey,
    queryFn: () => listPlanningVisits(tenant.id, moveDays(from, -1), to, null),
  })
  const teams = useQuery(workTeamsQuery(tenant.id))
  const visibleVisits = (visits.data ?? [])
    .filter(
      (visit) =>
        dateValue(toCalendarWallTime(visit.scheduled_start_at, visit.timezone)) <= to &&
        dateValue(
          toCalendarWallTime(
            new Date(Date.parse(visit.scheduled_end_at) - 1).toISOString(),
            visit.timezone,
          ),
        ) >= from &&
        (!teamFilter ||
          (teamFilter === 'unassigned'
            ? !visit.work_team_id
            : visit.work_team_id === teamFilter)) &&
        (!statusFilter || visit.status === statusFilter) &&
        (!filterTechnicianId ||
          (filterTechnicianId === 'unassigned'
            ? !visit.assigned_user_id && !visit.work_team_id
            : visit.assigned_user_id === filterTechnicianId)) &&
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
    ...staffAbsencesQuery(tenant.id, from, moveDays(to, 1)),
    enabled: session?.role === 'admin',
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
  const visibleIds = new Set(visibleVisits.map((visit) => visit.id))
  const calendarGroups = groupVisitsByContractDay(visits.data ?? []).filter((group) =>
    group.visits.some((visit) => visibleIds.has(visit.id)),
  )
  const calendarGroupById = new Map(calendarGroups.map((group) => [group.id, group]))
  const canReplan = session?.role === 'admin'
  const canReviewTravel = canReplan && session?.tenantId === tenant.id
  const travelRoutes = useMemo(
    () => (canReviewTravel && visits.isSuccess ? dailyTravelRoutes(visits.data, date) : []),
    [canReviewTravel, date, visits.data, visits.isSuccess],
  )
  const calendarItems: CalendarEvent[] = calendarGroups.map((group) => {
    const visit = group.visits[0]
    const pending = pendingChanges[group.id]
    const multiple = group.visits.length > 1
    return {
      id: group.id,
      revision: multiple
        ? group.visits.map((item) => `${item.id}:${item.updated_at}`).join('|')
        : visit.updated_at,
      title: group.title,
      start: pending?.start ?? group.start,
      end: pending?.end ?? group.end,
      editable: canReplan && group.visits.every((item) => item.status === 'scheduled') && !pending,
      resizable: !multiple && period !== 'month',
      tone:
        visit.priority === 'urgent' && visit.status === 'scheduled'
          ? 'danger'
          : statusTones[visit.status],
      description: `${visit.client_name} · ${multiple ? `${group.visits.length} trabajos` : statusLabels[visit.status]}${pending ? ' · Guardando' : ''}`,
    }
  })
  const selectedCalendarGroup = selectedCalendarVisitId
    ? calendarGroupById.get(selectedCalendarVisitId)
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
    setAppointmentVisitId(null)
    void navigate({
      to: '/trabajos',
      search: (previous) => ({ ...previous, date, period, ...update }),
      replace,
    })
  }

  async function refreshReplannedVisits() {
    await Promise.all(
      ['office-visits', 'my-visits', 'vacation-coverage', 'visit-report', 'service-contract'].map(
        (key) => queryClient.invalidateQueries({ queryKey: [key, tenant.id] }),
      ),
    )
  }

  async function saveCalendarChange(change: CalendarEventChange) {
    if (savingOccurrence) return
    const group = calendarGroupById.get(change.item.id)
    if (!group) return
    const visit = group.visits[0]
    if (group.visits.length > 1) {
      if (
        !canReplan ||
        change.kind !== 'move' ||
        moving.current.has(group.id) ||
        group.visits.some((item) => item.status !== 'scheduled') ||
        !visit.contract_id
      )
        return
      const revision = group.visits.map((item) => `${item.id}:${item.updated_at}`).join('|')
      if (revision !== change.item.revision) {
        toast.error('El contrato ha cambiado. Revisa el calendario antes de moverlo.')
        return
      }
      const shiftMinutes = Math.round(
        (wallTimeNumber(change.start) - wallTimeNumber(group.start)) / 60_000,
      )
      if (!shiftMinutes) return
      const payload = {
        tenantId: tenant.id,
        contractId: visit.contract_id,
        sourceDate: dateValue(group.start),
        visits: group.visits.map((item) => ({ id: item.id, updated_at: item.updated_at })),
        shiftMinutes,
      }
      const key = JSON.stringify(payload)
      const operationId = operations.current.get(key) ?? crypto.randomUUID()
      operations.current.set(key, operationId)
      moving.current.add(group.id)
      setPendingChanges((previous) => ({ ...previous, [group.id]: change }))
      try {
        await replanContractDay({ ...payload, operationId })
        operations.current.delete(key)
        await refreshReplannedVisits()
        toast.success('Contrato reprogramado', {
          description: replannedStartLabel.format(change.start),
        })
      } catch (error) {
        toast.error('No se pudo reprogramar el contrato', {
          description: error instanceof Error ? error.message : 'Vuelve a intentarlo.',
        })
        await queryClient.invalidateQueries({ queryKey: ['office-visits', tenant.id] })
      } finally {
        moving.current.delete(group.id)
        setPendingChanges((previous) => {
          const next = { ...previous }
          delete next[group.id]
          return next
        })
      }
      return
    }
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
          <>
            <Button
              variant="outline"
              isDisabled={savingOccurrence || Boolean(pendingChanges[visit.id])}
              onPress={() => {
                setSkipVisitId(null)
                setReplanning(visit)
              }}
            >
              {visit.contract_occurrence_on ? 'Mover esta visita' : 'Reprogramar'}
            </Button>
            <Button
              variant="outline"
              onPress={() =>
                setAppointmentVisitId(appointmentVisitId === visit.id ? null : visit.id)
              }
            >
              Enlace de cita
            </Button>
            {visit.contract_occurrence_on ? (
              <Button
                variant="outline"
                isDisabled={savingOccurrence || Boolean(pendingChanges[visit.id])}
                onPress={({ target }) => {
                  skipTrigger.current = target instanceof HTMLElement ? target : null
                  setReplanning(null)
                  setSkipVisitId(visit.id)
                }}
              >
                Omitir esta visita
              </Button>
            ) : null}
          </>
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
        <VisitMapsAction
          addressMayBeIncomplete
          address={visit.address}
          label={`Cómo llegar a ${visit.title} en Google Maps`}
        />
        {appointmentVisitId === visit.id && canReplan && visit.status === 'scheduled' ? (
          <AppointmentLinkManager
            key={visit.id}
            tenantId={tenant.id}
            visitId={visit.id}
            revision={visit.updated_at}
            timezone={visit.timezone}
            onClose={() => setAppointmentVisitId(null)}
          />
        ) : null}
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
            onPendingChange={setSavingOccurrence}
          />
        ) : null}
        {skipVisitId === visit.id && canReplan && visit.status === 'scheduled' ? (
          <VisitOccurrenceSkipForm
            key={`${visit.id}:${visit.updated_at}`}
            tenantId={tenant.id}
            visit={visit}
            onPendingChange={setSavingOccurrence}
            onDone={async () => {
              setSkipVisitId(null)
              await refreshReplannedVisits()
            }}
            onCancel={() => {
              skipTrigger.current?.focus()
              setSkipVisitId(null)
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

      {canReplan ? (
        <AgendaResolutionPanel
          key={tenant.id}
          tenantId={tenant.id}
          today={today}
          technicians={technicians.data ?? []}
          editingState={technicians.isSuccess ? 'ready' : technicians.isError ? 'error' : 'loading'}
          onRetryTechnicians={() => void technicians.refetch()}
          onSaved={refreshReplannedVisits}
        />
      ) : null}
      {canReplan && session?.userId ? (
        <VisitSwapsPanel
          key={`${tenant.id}:${session.userId}`}
          tenantId={tenant.id}
          userId={session.userId}
          office
          onSaved={refreshReplannedVisits}
        />
      ) : null}
      {canReplan ? (
        <AppointmentChangeInbox
          key={tenant.id}
          tenantId={tenant.id}
          onSaved={refreshReplannedVisits}
        />
      ) : null}
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
        {canReplan ? (
          <div className="flex flex-wrap items-center gap-2">
            <BatchVisitReplan
              key={tenant.id}
              tenantId={tenant.id}
              visits={visibleVisits}
              disabled={
                !visits.isSuccess || savingOccurrence || Object.keys(pendingChanges).length > 0
              }
              onSaved={refreshReplannedVisits}
            />
            {canReviewTravel ? (
              <AgendaTravelReview
                key={`${tenant.id}:${session.userId}:${date}`}
                date={date}
                routes={travelRoutes}
                disabled={
                  !visits.isSuccess ||
                  visits.isFetching ||
                  savingOccurrence ||
                  Object.keys(pendingChanges).length > 0
                }
              />
            ) : null}
          </div>
        ) : null}
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
            No se pudieron comprobar las ausencias aprobadas: {approvedVacations.error.message}
          </p>
        ) : null}

        {view === 'calendar' ? (
          <>
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
                value={calendarAnchor}
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
                  const group = calendarGroupById.get(item.id)
                  if (!group) return
                  setSkipVisitId(null)
                  setSelectedCalendarVisitId(item.id)
                  setOpenReportId(null)
                  setReplanning(item.editable && group.visits.length === 1 ? group.visits[0] : null)
                }}
                onItemChange={canReplan ? (change) => void saveCalendarChange(change) : undefined}
                renderItem={(item) => {
                  const group = calendarGroupById.get(item.id)
                  const visit = group?.visits[0]
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
                              group && group.visits.length > 1
                                ? `${group.visits.length} trabajos`
                                : statusLabels[visit.status],
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
            {selectedCalendarGroup ? (
              <CalendarDetailsDialog
                title={selectedCalendarGroup.title}
                description={
                  selectedCalendarGroup.visits.length > 1
                    ? `${selectedCalendarGroup.visits.length} trabajos del contrato`
                    : 'Detalle del trabajo'
                }
                preventDismissal={savingOccurrence}
                onClose={() => {
                  setSkipVisitId(null)
                  setSelectedCalendarVisitId(null)
                  setReplanning(null)
                  setOpenReportId(null)
                }}
              >
                <div className="space-y-4">
                  {selectedCalendarGroup.visits.map((selectedCalendarVisit) => (
                    <div
                      key={selectedCalendarVisit.id}
                      className="border-border space-y-3 rounded-lg border p-4"
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
                          <VisitOccurrenceReference
                            date={selectedCalendarVisit.contract_occurrence_on}
                          />
                          {hasApprovedVacationConflict(selectedCalendarVisit) ? (
                            <p className="text-destructive text-sm font-medium">
                              Ausencia confirmada · revisar cobertura en{' '}
                              <Link to="/vacaciones" className="underline">
                                Vacaciones
                              </Link>
                            </p>
                          ) : null}
                        </div>
                        {renderVisitActions(selectedCalendarVisit)}
                      </div>
                      {renderVisitExpandedDetails(selectedCalendarVisit)}
                    </div>
                  ))}
                </div>
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
                          Ausencia confirmada · revisar cobertura en{' '}
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
                      <VisitOccurrenceReference date={visit.contract_occurrence_on} />
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
