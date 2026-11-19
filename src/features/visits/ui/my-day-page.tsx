import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { CaretLeftIcon, CaretRightIcon, MapPinIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { useSession } from '@/features/auth'
import {
  fieldEntryQueueKey,
  readFieldEntryQueue,
} from '@/features/field-entries/application/field-entry-queue'
import {
  readVisitIncidentQueue,
  visitIncidentQueueKey,
} from '@/features/incidents/application/incident-queue'
import { listMyDayTasks } from '@/features/visits/application/my-day-tasks'
import { moveDays } from '@/shared/lib/date-range'
import { WorkerLoading, WorkerState } from '@/shared/ui/worker-state'

import {
  listMyVisits,
  transitionServiceVisit,
  type VisitSummary,
} from '../application/visit-actions'
import { listPendingVisitPhotos } from '../application/visit-photo-queue'
import {
  readVisitReportLocalDraft,
  visitReportDraftKey,
} from '../application/visit-report-local-draft'
import { MyVisitsCalendar } from './my-visits-calendar'
import { groupVisitsByContractDay } from './visit-calendar-groups'
import { VisitReportEditor } from './visit-report-editor'
import { WorkerBatchPaperReports } from './worker-batch-paper-reports'
import { WorkerPaperReport } from './worker-paper-report'

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

const taskStatusLabels = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Hecha',
  skipped: 'No aplica',
} as const

export function MyDayPage() {
  const session = useSession()
  const tenantId = session?.tenantId
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayInMadrid)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openReportId, setOpenReportId] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null)
  const operations = useRef(new Map<string, string>())
  const queryKey = ['my-visits', tenantId, date]
  const visits = useQuery({
    queryKey,
    enabled: Boolean(tenantId),
    queryFn: () => {
      if (!tenantId) throw new Error('Selecciona una empresa.')
      return listMyVisits(tenantId, date, date)
    },
  })
  const visitIds = visits.data?.map((visit) => visit.id) ?? []
  const tasks = useQuery({
    queryKey: ['my-day-tasks', tenantId, date, visits.data],
    enabled: Boolean(tenantId) && visits.isSuccess && visitIds.length > 0,
    queryFn: () => {
      if (!tenantId || !visits.data) throw new Error('Selecciona una empresa.')
      return listMyDayTasks(tenantId, visits.data)
    },
  })
  const tasksByVisit = new Map(tasks.data?.map((entry) => [entry.visitId, entry.tasks]) ?? [])

  async function changeStatus(visit: VisitSummary, nextStatus: 'in_progress' | 'completed') {
    if (!tenantId || busyId) return
    let startLocation: { latitude: number; longitude: number } | null = null
    if (nextStatus === 'in_progress' && session?.role === 'user') {
      if (!navigator.geolocation) {
        toast.error('Este dispositivo no permite compartir la ubicación requerida por la empresa.')
        return
      }
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 12_000,
            maximumAge: 60_000,
          })
        })
        startLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }
      } catch {
        toast.error('No se pudo obtener la ubicación. Autorízala para iniciar esta visita.')
        return
      }
    }
    if (nextStatus === 'completed' && session?.userId) {
      try {
        if ((await listPendingVisitPhotos(session.userId, tenantId, visit.id)).length > 0) {
          setOpenReportId(visit.id)
          toast.error('Envía o descarta las fotografías pendientes antes de completar la visita.')
          return
        }
      } catch {
        setOpenReportId(visit.id)
        toast.error('No se pudo comprobar si hay fotografías pendientes en este dispositivo.')
        return
      }
    }
    if (
      nextStatus === 'completed' &&
      session?.userId &&
      readVisitIncidentQueue(visitIncidentQueueKey(session.userId, tenantId, visit.id)).length > 0
    ) {
      setOpenReportId(visit.id)
      toast.error('Envía o descarta las incidencias pendientes antes de completar la visita.')
      return
    }
    if (
      nextStatus === 'completed' &&
      session?.userId &&
      readFieldEntryQueue(fieldEntryQueueKey(session.userId, tenantId, visit.id)).length > 0
    ) {
      setOpenReportId(visit.id)
      toast.error('Envía o descarta la actividad pendiente antes de completar la visita.')
      return
    }
    if (
      nextStatus === 'completed' &&
      session?.userId &&
      readVisitReportLocalDraft(visitReportDraftKey(session.userId, tenantId, visit.id))
    ) {
      setOpenReportId(visit.id)
      toast.error('Guarda o descarta el borrador del parte antes de completar la visita.')
      return
    }
    const key = `${visit.id}:${nextStatus}:${visit.updated_at}`
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
    setBusyId(visit.id)
    try {
      await transitionServiceVisit({
        tenantId,
        visitId: visit.id,
        expectedUpdatedAt: visit.updated_at,
        nextStatus,
        reason: '',
        operationId,
        startLocation,
      })
      operations.current.delete(key)
      await queryClient.invalidateQueries({ queryKey })
      toast.success(nextStatus === 'completed' ? 'Visita completada' : 'Visita iniciada')
    } catch (error) {
      toast.error('No se pudo cambiar la visita', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await queryClient.invalidateQueries({ queryKey })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="worker-page space-y-6">
      <div className="worker-hero flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="worker-title">Mi jornada</h1>
        </div>
        <div className="worker-day-controls">
          <fieldset className="flex rounded-lg border p-1">
            <legend className="sr-only">Vista de mi jornada</legend>
            <Button
              size="sm"
              variant={!calendarOpen ? 'default' : 'ghost'}
              aria-pressed={!calendarOpen}
              onPress={() => setCalendarOpen(false)}
            >
              Día
            </Button>
            <Button
              size="sm"
              variant={calendarOpen ? 'default' : 'ghost'}
              aria-pressed={calendarOpen}
              onPress={() => setCalendarOpen(true)}
            >
              Calendario
            </Button>
          </fieldset>
          {!calendarOpen ? (
            <>
              <Button
                variant="outline"
                onPress={() => {
                  setSelectedContractId(null)
                  setDate(todayInMadrid())
                }}
              >
                Hoy
              </Button>
              <div className="worker-day-picker">
                <Button
                  variant="outline"
                  className="size-10 p-0"
                  aria-label="Día anterior"
                  onPress={() => {
                    setSelectedContractId(null)
                    setDate((current) => moveDays(current, -1))
                  }}
                >
                  <CaretLeftIcon aria-hidden="true" />
                </Button>
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
                  <span className="sr-only">Día</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => {
                      if (event.target.value) {
                        setSelectedContractId(null)
                        setDate(event.target.value)
                      }
                    }}
                    className="border-input bg-background h-10 w-full min-w-0 rounded-lg border px-3 py-2"
                  />
                </label>
                <Button
                  variant="outline"
                  className="size-10 p-0"
                  aria-label="Día siguiente"
                  onPress={() => {
                    setSelectedContractId(null)
                    setDate((current) => moveDays(current, 1))
                  }}
                >
                  <CaretRightIcon aria-hidden="true" />
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>
      {calendarOpen && tenantId ? (
        <MyVisitsCalendar
          tenantId={tenantId}
          date={date}
          onDateChange={(nextDate) => {
            setSelectedContractId(null)
            setDate(nextDate)
          }}
          onSelectDay={(nextDate) => {
            setSelectedContractId(null)
            setDate(nextDate)
            setCalendarOpen(false)
          }}
          onOpenGroup={(nextDate, contractId) => {
            setDate(nextDate)
            setSelectedContractId(contractId)
            setCalendarOpen(false)
          }}
        />
      ) : null}
      <div hidden={calendarOpen} className="space-y-6">
        {visits.isSuccess && visits.data.length > 0 && tenantId ? (
          <WorkerBatchPaperReports
            key={`${tenantId}:${date}`}
            tenantId={tenantId}
            visits={visits.data ?? []}
            disabled={!visits.isSuccess || visits.isFetching}
          />
        ) : null}
        <div className="worker-section-heading">
          <h2>Visitas del día</h2>
          {visits.isSuccess ? (
            <span className="worker-count">
              {visits.data.length} {visits.data.length === 1 ? 'visita' : 'visitas'}
            </span>
          ) : null}
        </div>
        {visits.isPending ? <WorkerLoading label="Cargando visitas…" /> : null}
        {visits.isError ? (
          <WorkerState
            error
            title="No se pudo cargar tu jornada"
            description="Comprueba tu conexión y vuelve a intentarlo."
            onRetry={() => void visits.refetch()}
          />
        ) : null}
        {visits.data?.length === 0 ? (
          <WorkerState
            title="Tu agenda está despejada"
            description="No tienes visitas asignadas para este día. Usa las flechas para consultar otra jornada."
          />
        ) : null}
        {groupVisitsByContractDay(visits.data ?? []).map((group) => {
          const cards = group.visits.map((visit) => (
            <Card key={visit.id} className="worker-visit-card">
              <CardHeader className="gap-2 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{visit.title}</CardTitle>
                  <span className="bg-muted rounded-full px-2.5 py-1 text-xs font-medium">
                    {statusLabels[visit.status]}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="font-medium">
                  {new Date(visit.scheduled_start_at).toLocaleTimeString('es-ES', {
                    timeZone: visit.timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  –{' '}
                  {new Date(visit.scheduled_end_at).toLocaleTimeString('es-ES', {
                    timeZone: visit.timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  <span className="text-muted-foreground font-normal"> · {visit.timezone}</span>
                </p>
                <p>{visit.client_name}</p>
                {visit.work_team_id ? (
                  <p className="text-muted-foreground">Visita de tu equipo</p>
                ) : null}
                {visit.location_name ? <p>{visit.location_name}</p> : null}
                {visit.address ? (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">{visit.address}</p>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(visit.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex min-h-10 items-center gap-1 font-medium underline"
                    >
                      <MapPinIcon aria-hidden="true" />
                      Cómo llegar
                    </a>
                  </div>
                ) : null}
                {visit.notes ? <p className="whitespace-pre-line">{visit.notes}</p> : null}
                {visit.work_order_id ? (
                  <section
                    aria-label="Tareas del servicio"
                    className="space-y-2 rounded-lg border p-3"
                  >
                    <h3 className="font-medium">Tareas del servicio</h3>
                    {tasks.isPending ? (
                      <p className="text-muted-foreground">Cargando tareas…</p>
                    ) : null}
                    {tasks.isError ? (
                      <p role="alert" className="text-destructive">
                        No se pudieron cargar las tareas: {tasks.error.message}
                      </p>
                    ) : null}
                    {tasks.isSuccess && !tasksByVisit.get(visit.id)?.length ? (
                      <p className="text-muted-foreground">
                        Este servicio no tiene tareas añadidas.
                      </p>
                    ) : null}
                    {tasksByVisit.get(visit.id)?.map((task) => (
                      <div key={task.id} className="border-t pt-2 first:border-0 first:pt-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <p className="font-medium">{task.title}</p>
                          <span aria-label={`Estado: ${taskStatusLabels[task.status]}`}>
                            {taskStatusLabels[task.status]}
                          </span>
                        </div>
                        <p className="text-muted-foreground">{task.phaseTitle}</p>
                        {task.notes ? <p className="whitespace-pre-line">{task.notes}</p> : null}
                        {task.checklist.length ? (
                          <ul className="mt-1 space-y-1 pl-4">
                            {task.checklist.map((item) => (
                              <li key={item.id} className="flex gap-2">
                                <span aria-hidden="true">{item.done ? '✓' : '○'}</span>
                                <span>{item.label}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </section>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {visit.status === 'scheduled' ? (
                    <Button
                      isDisabled={Boolean(busyId)}
                      onPress={() => void changeStatus(visit, 'in_progress')}
                    >
                      Iniciar visita
                    </Button>
                  ) : null}
                  {visit.status === 'in_progress' ? (
                    <Button
                      isDisabled={Boolean(busyId)}
                      onPress={() => void changeStatus(visit, 'completed')}
                    >
                      Completar visita
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    onPress={() => setOpenReportId(openReportId === visit.id ? null : visit.id)}
                  >
                    {openReportId === visit.id ? 'Ocultar parte' : 'Abrir parte'}
                  </Button>
                </div>
                {tenantId ? (
                  <WorkerPaperReport key={visit.id} tenantId={tenantId} visit={visit} />
                ) : null}
                {openReportId === visit.id && tenantId && session?.userId ? (
                  <VisitReportEditor
                    key={`${session.userId}:${tenantId}:${visit.id}`}
                    visit={visit}
                    tenantId={tenantId}
                    userId={session.userId}
                  />
                ) : null}
              </CardContent>
            </Card>
          ))
          const contractId = group.visits[0]?.contract_id
          return contractId ? (
            <details
              key={group.id}
              open={selectedContractId === contractId || undefined}
              onToggle={(event) => {
                if (!event.currentTarget.open && selectedContractId === contractId) {
                  setSelectedContractId(null)
                }
              }}
              className="rounded-lg border"
            >
              <summary className="cursor-pointer px-4 py-3 font-semibold">
                <span>{group.title}</span>{' '}
                <span className="text-muted-foreground text-sm font-normal">
                  · {group.visits.length} {group.visits.length === 1 ? 'trabajo' : 'trabajos'}
                </span>
                <span className="text-muted-foreground mt-1 block text-sm font-normal">
                  {group.visits[0].client_name}
                  {group.visits[0].location_name
                    ? ` · ${group.visits[0].location_name}`
                    : ''} ·{' '}
                  {group.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {group.end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </summary>
              <div className="space-y-3 px-3 pb-3">{cards}</div>
            </details>
          ) : (
            cards
          )
        })}
        {session?.role === 'user' ? (
          <p className="worker-privacy">
            <MapPinIcon size={16} aria-hidden="true" /> Al iniciar una visita se guarda la hora y
            una ubicación puntual; no hay seguimiento continuo.
          </p>
        ) : null}
      </div>
    </div>
  )
}
