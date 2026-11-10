import {
  Button,
  Calendar,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  toast,
  type CalendarItem,
} from '@doscientos/ui'
import { PlusIcon } from '@phosphor-icons/react'
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
import { useTenantData } from '@/shared/store/store'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  createServiceVisit,
  listAllOfficeVisits,
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
import { VisitReplanForm } from './visit-replan-form'
import { VisitReportEditor } from './visit-report-editor'
import { PaperVisitPanel } from './paper-visit-panel'
import { BatchWorkSheets } from './batch-work-sheets'

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
  const navigate = useNavigate()
  const search = useSearch({ from: '/agenda' })
  const date = search.date ?? todayInMadrid()
  const view: AgendaView = search.view ?? 'list'
  const period: AgendaPeriod = search.period ?? (view === 'calendar' ? 'month' : 'day')
  const [filterTechnicianId, setFilterTechnicianId] = useState('')
  const [selectedCalendarVisitId, setSelectedCalendarVisitId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [initialLocalStart, setInitialLocalStart] = useState(() => `${todayInMadrid()}T09:00`)
  const [clientId, setClientId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [title, setTitle] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [localStart, setLocalStart] = useState(initialLocalStart)
  const [duration, setDuration] = useState('60')
  const [priority, setPriority] = useState<VisitPriority>('normal')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [replanning, setReplanning] = useState<VisitSummary | null>(null)
  const [openReportId, setOpenReportId] = useState<string | null>(null)
  const [teamFilter, setTeamFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [textFilter, setTextFilter] = useState('')
  const operations = useRef(new Map<string, string>())
  const related = useRelatedRecordCreation({
    tenantId: tenant.id,
    clientId,
    locationId,
    onClientCreated: (id) => {
      setClientId(id)
      setLocationId('')
      setAssetId('')
    },
    onLocationCreated: (id) => {
      setLocationId(id)
      setAssetId('')
    },
    onPoolCreated: setAssetId,
  })
  const calendarRange = period === 'month' ? calendarMonthRange(date) : calendarWeekRange(date)
  const from = period === 'month' || (view === 'calendar' && period === 'week') ? calendarRange.from : date
  const to = period === 'month' || (view === 'calendar' && period === 'week') ? calendarRange.to : period === 'week' ? addDays(date, 6) : date
  const queryPage = 'all'
  const queryKey = ['office-visits', tenant.id, from, to, filterTechnicianId, queryPage]
  const visits = useQuery({
    queryKey,
    queryFn: () => listAllOfficeVisits(tenant.id, from, to, filterTechnicianId === 'unassigned' ? null : filterTechnicianId || null),
  })
  const teams = useQuery(workTeamsQuery(tenant.id))
  const visibleVisits = (visits.data ?? []).filter(visit =>
    (!teamFilter || (teamFilter === 'unassigned' ? !visit.work_team_id : visit.work_team_id === teamFilter)) &&
    (!statusFilter || visit.status === statusFilter) &&
    (filterTechnicianId !== 'unassigned' || (!visit.assigned_user_id && !visit.work_team_id)) &&
    `${visit.client_name} ${visit.location_name} ${visit.address} ${visit.title}`.toLocaleLowerCase('es').includes(textFilter.trim().toLocaleLowerCase('es'))
  ).sort((a, b) => a.scheduled_start_at.slice(0, 10).localeCompare(b.scheduled_start_at.slice(0, 10)) ||
    (a.work_team_name || a.assigned_user_name || 'Sin asignar').localeCompare(b.work_team_name || b.assigned_user_name || 'Sin asignar') ||
    (a.route_order ?? 0) - (b.route_order ?? 0) || a.scheduled_start_at.localeCompare(b.scheduled_start_at) || a.id.localeCompare(b.id))
  const approvedVacations = useQuery({
    queryKey: ['approved-vacations', tenant.id, date, to],
    enabled: session?.role === 'admin',
    queryFn: () => listApprovedVacationRanges(tenant.id, date, to),
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
  const calendarItems: CalendarItem[] = visibleVisits.map((visit) => ({
    id: visit.id,
    title: visit.title,
    start: toCalendarWallTime(visit.scheduled_start_at, visit.timezone),
    end: toCalendarWallTime(visit.scheduled_end_at, visit.timezone),
    status: visit.status,
    priority: visit.priority,
    clientName: visit.client_name,
    assignedUserName: visit.assigned_user_name,
  }))
  const calendarVisitById = new Map((visits.data ?? []).map((visit) => [visit.id, visit]))
  const selectedCalendarVisit = visits.data?.find((visit) => visit.id === selectedCalendarVisitId)
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
    assetId ||
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
    setAssetId('')
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
      assetId: assetId || null,
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

  function updateSearch(update: { view?: AgendaView; date?: string; period?: AgendaPeriod }) {
    void navigate({ to: '/agenda', search: (previous) => ({ ...previous, ...update }) })
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
        {visit.status === 'scheduled' ? (
          <Button variant="outline" onPress={() => setReplanning(visit)}>
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
              await queryClient.invalidateQueries({ queryKey: ['office-visits', tenant.id] })
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Planificación y partes</h1>
          <p className="text-muted-foreground text-sm">
            Servicios móviles por día, semana o mes; equipo, asignación y partes impresos.
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
              setAssetId('')
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
            onChange={(value) => {
              setLocationId(value)
              setAssetId('')
            }}
          />
          {related.allowed && clientId ? (
            <RelatedCreateButton
              label="Crear ubicación"
              disabled={related.pending}
              onPress={() => related.start('location')}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <SelectField
            label="Activo"
            value={assetId}
            options={[
              { value: '', label: 'Sin activo' },
              ...(targets.data?.assets ?? [])
                .filter((asset) => asset.location_id === locationId)
                .map((asset) => ({ value: asset.id, label: asset.name })),
            ]}
            onChange={setAssetId}
          />
          {related.allowed && locationId ? (
            <RelatedCreateButton
              label="Crear piscina"
              disabled={related.pending}
              onPress={() => related.start('pool')}
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
                {view === 'calendar' ? 'Calendario de visitas' : 'Lista de visitas'}
              </CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                {view === 'calendar'
                  ? period === 'month' ? new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : calendarWeekLabel(date)
                  : period === 'day'
                    ? 'Consulta las visitas de un día.'
                    : 'Consulta las visitas de una semana.'}
              </p>
            </div>
            <fieldset className="inline-flex rounded-lg border p-1">
              <legend className="sr-only">Cambiar vista de agenda</legend>
              {(['list', 'calendar'] as const).map((nextView) => (
                <button
                  key={nextView}
                  type="button"
                  aria-pressed={view === nextView}
                  onClick={() => {
                    setSelectedCalendarVisitId(null)
                    updateSearch({ view: nextView })
                  }}
                  className={`focus-visible:outline-ring rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${view === nextView
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                >
                  {nextView === 'list' ? 'Lista' : 'Calendario'}
                </button>
              ))}
            </fieldset>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
            <div className="space-y-3">
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
              {view === 'calendar' ? (
                <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
                  <Button
                    variant="outline"
                    onPress={() => {
                      setSelectedCalendarVisitId(null)
                      updateSearch({ date: period === 'month' ? moveCalendarMonth(date, -1) : addDays(date, -7) })
                    }}
                  >
                    Periodo anterior
                  </Button>
                  <Button
                    variant="outline"
                    onPress={() => {
                      setSelectedCalendarVisitId(null)
                      updateSearch({ date: todayInMadrid() })
                    }}
                  >
                    Hoy
                  </Button>
                  <Button
                    variant="outline"
                    onPress={() => {
                      setSelectedCalendarVisitId(null)
                      updateSearch({ date: period === 'month' ? moveCalendarMonth(date, 1) : addDays(date, 7) })
                    }}
                  >
                    Periodo siguiente
                  </Button>
                </div>
              ) : <Button variant="outline" onPress={() => updateSearch({ date: todayInMadrid(), period: 'day' })}>Hoy</Button>}
            </div>
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
                setFilterTechnicianId(value)
                setSelectedCalendarVisitId(null)
              }}
            />
            <SelectField label="Equipo" value={teamFilter} onChange={setTeamFilter} options={[{ value: '', label: 'Todos los equipos' }, { value: 'unassigned', label: 'Sin equipo' }, ...(teams.data ?? []).map(t => ({ value: t.id, label: t.name }))]} />
            <SelectField label="Estado" value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'Todos los estados' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} />
            <TextField label="Buscar cliente o centro" value={textFilter} onChange={setTextFilter} placeholder="Nombre o dirección" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{visibleVisits.length} visitas · {Math.round(visibleVisits.filter(v => v.status !== 'canceled' && v.status !== 'skipped').reduce((total, v) => total + (Date.parse(v.scheduled_end_at) - Date.parse(v.scheduled_start_at)) / 60000, 0))} minutos estimados (no equivale a trabajo realizado)</p>
          {view === 'list' && period === 'day' ? <BatchWorkSheets tenantId={tenant.id} visits={visibleVisits.filter(v => v.status !== 'canceled' && v.status !== 'skipped')} /> : null}
          {visits.isPending ? <output>Cargando agenda…</output> : null}
          {visits.isError ? (
            <p role="alert" className="text-destructive text-sm">
              No se pudo cargar la agenda: {visits.error.message}
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
                  No hay visitas en este periodo con estos filtros. Puedes elegir otra fecha.
                </output>
              ) : null}
              <Calendar
                aria-label={period === 'month' ? 'Calendario mensual de visitas' : period === 'day' ? 'Calendario diario de visitas' : 'Calendario semanal de visitas'}
                view={period}
                value={calendarDateValue(date)}
                items={calendarItems}
                minuteStep={30}
                dayStartHour={7}
                dayEndHour={21}
                onItemClick={(item) => {
                  setSelectedCalendarVisitId(item.id)
                  setOpenReportId(null)
                }}
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
                        {visit.assigned_user_name || 'Pendiente de asignar'}
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
                <section
                  aria-label="Visita seleccionada"
                  className="border-border bg-muted/30 space-y-3 rounded-lg border p-4"
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
                        {selectedCalendarVisit.assigned_user_name || 'Pendiente de asignar'} ·{' '}
                        {statusLabels[selectedCalendarVisit.status]}
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
                </section>
              ) : null}
            </>
          ) : (
            <>
              {visits.data?.length === 0 ? (
                <p className="text-muted-foreground text-sm">No hay visitas en este periodo.</p>
              ) : null}
              <ol className="divide-border divide-y">
                {visibleVisits.map((visit, index) => (
                  <li key={visit.id} className="space-y-3 py-4 text-sm">
                    {index === 0 || (visibleVisits[index - 1]?.work_team_id ?? visibleVisits[index - 1]?.assigned_user_id) !== (visit.work_team_id ?? visit.assigned_user_id) || visibleVisits[index - 1]?.scheduled_start_at.slice(0, 10) !== visit.scheduled_start_at.slice(0, 10) ? <h3 className="text-primary font-semibold">{visit.work_team_name || visit.assigned_user_name || 'Sin asignar'} · {new Date(visit.scheduled_start_at).toLocaleDateString('es-ES', { timeZone: visit.timezone })}</h3> : null}
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
                          {visit.work_team_name || visit.assigned_user_name || 'Pendiente de asignar'} · Orden {visit.route_order ?? 0} ·{' '}
                          {statusLabels[visit.status]}
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
