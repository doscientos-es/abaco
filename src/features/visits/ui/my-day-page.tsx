import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ClockIcon,
  MapPinIcon,
  NotePencilIcon,
} from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

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
import { calendarDate, moveDays, todayInMadrid } from '@/shared/lib/date-range'
import { useActionLock } from '@/shared/lib/use-action-lock'
import { VisitMapsAction } from '@/shared/ui/contact-actions'
import { WorkerLoading, WorkerState } from '@/shared/ui/worker-state'

import { visitEvidenceAnchor, type EvidenceKind } from '../application/pending-visit-evidence'
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
import type { CalendarVisitLink } from '../domain/calendar-visit-link'
import { nextAssignedVisit } from '../domain/next-assigned-visit'
import { MyVisitsCalendar } from './my-visits-calendar'
import { groupVisitsByContractDay } from './visit-calendar-groups'
import { VisitReportEditor } from './visit-report-editor'
import { WorkerBatchPaperReports } from './worker-batch-paper-reports'
import { WorkerClosedVisitHistory } from './worker-closed-visit-history'
import { WorkerNextVisit } from './worker-next-visit'
import { WorkerPaperReport } from './worker-paper-report'
import { WorkerPendingEvidence } from './worker-pending-evidence'
import { WorkerPendingReports } from './worker-pending-reports'
import { WorkerVisitStatus } from './worker-visit-status'

const longDay = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const visitAnchor = (id: string) => `worker-visit-${id}`
const reportAnchor = (id: string) => `worker-report-${id}`

function focusSection(anchor: string) {
  const target = document.getElementById(anchor)
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'start' })
}

const dayViews = [
  ['day', 'Día'],
  ['calendar', 'Calendario'],
  ['history', 'Historial'],
  ['evidence', 'Envíos'],
] as const
type DayView = (typeof dayViews)[number][0]

const taskStatusLabels = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Hecha',
  skipped: 'No aplica',
} as const

export function MyDayPage({ calendarVisit = null }: { calendarVisit?: CalendarVisitLink | null }) {
  const session = useSession()
  const tenantId = session?.tenantId
  const userId = session?.userId
  const queryClient = useQueryClient()
  const [date, setDate] = useState(() => calendarVisit?.fecha ?? todayInMadrid())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [visitError, setVisitError] = useState<{ id: string; message: string } | null>(null)
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const statusLock = useActionLock()
  const reportGuard = useRef<'saving' | 'unpersisted' | null>(null)
  const [openReportId, setOpenReportId] = useState<string | null>(null)
  const [view, setView] = useState<DayView>('day')
  const dayOpen = view === 'day'
  const calendarOpen = view === 'calendar'
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null)
  const [linkedGroupDismissed, setLinkedGroupDismissed] = useState(false)
  const operations = useRef(new Map<string, string>())
  const [now, setNow] = useState(Date.now)
  const today = todayInMadrid(new Date(now))
  useEffect(() => {
    const update = () => setNow(Date.now())
    const timer = window.setInterval(update, 60_000)
    window.addEventListener('focus', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
    }
  }, [])
  const queryKey = ['my-visits', tenantId, date, userId]
  const visits = useQuery({
    queryKey,
    enabled: Boolean(tenantId && dayOpen),
    queryFn: () => {
      if (!tenantId) throw new Error('Selecciona una empresa.')
      return listMyVisits(tenantId, date, date)
    },
  })
  const dayVisits = visits.data ?? []
  const previewNext = date === today && dayOpen && visits.isSuccess
  const nextToday = previewNext ? nextAssignedVisit(dayVisits, now) : undefined
  const futureVisits = useQuery({
    queryKey: ['my-visits', tenantId, 'next', today, userId],
    enabled: Boolean(tenantId && previewNext && !nextToday),
    queryFn: () => {
      if (!tenantId) throw new Error('Selecciona una empresa.')
      return listMyVisits(tenantId, moveDays(today, 1), moveDays(today, 7))
    },
  })
  const nextVisit = previewNext
    ? (nextToday ?? nextAssignedVisit(futureVisits.data ?? [], now))
    : undefined
  const completed = dayVisits.filter(({ status }) => status === 'completed').length
  const activeVisits = dayVisits.filter(({ status }) => status === 'in_progress')
  const activeVisit = activeVisits[0]
  const scheduled = dayVisits.filter(({ status }) => status === 'scheduled').length
  const hasVisitTasks = dayVisits.some((visit) => visit.work_order_id)
  const tasks = useQuery({
    queryKey: ['my-day-tasks', tenantId, date, userId, visits.data],
    enabled: Boolean(tenantId) && visits.isSuccess && hasVisitTasks,
    queryFn: () => {
      if (!tenantId || !visits.data) throw new Error('Selecciona una empresa.')
      return listMyDayTasks(tenantId, visits.data)
    },
  })
  const tasksByVisit = new Map(tasks.data?.map((entry) => [entry.visitId, entry.tasks]) ?? [])
  const linkCompanyMismatch = Boolean(
    calendarVisit && tenantId && calendarVisit.empresa !== tenantId,
  )
  const linkedVisit =
    !linkCompanyMismatch && calendarVisit?.fecha === date
      ? visits.data?.find((visit) => visit.id === calendarVisit.visita)
      : undefined

  useEffect(() => {
    if (dayOpen && visits.isSuccess) {
      const target = focusTarget ?? (linkedVisit ? visitAnchor(linkedVisit.id) : null)
      if (target) focusSection(target)
    }
  }, [dayOpen, focusTarget, linkedVisit, visits.isSuccess])

  function allowLeaveReport() {
    if (reportGuard.current === 'saving') return false
    return (
      reportGuard.current !== 'unpersisted' ||
      window.confirm(
        'El dispositivo no pudo conservar los cambios del parte. ¿Salir sin guardarlos?',
      )
    )
  }

  function selectDay(nextDate: string | ((current: string) => string)) {
    setSelectedContractId(null)
    setOpenReportId(null)
    setFocusTarget(null)
    setDate(nextDate)
  }

  function goToDate(nextDate: string | ((current: string) => string)) {
    if (allowLeaveReport()) selectDay(nextDate)
  }

  function changeView(nextView: DayView) {
    if (view === nextView || !allowLeaveReport()) return
    setOpenReportId(null)
    setFocusTarget(null)
    setView(nextView)
  }

  function openVisit(nextDate: string, contractId: string | null, visitId: string) {
    if (!allowLeaveReport()) return
    setDate(nextDate)
    setSelectedContractId(contractId)
    setOpenReportId(null)
    setFocusTarget(visitAnchor(visitId))
    setView('day')
    if (nextDate === date && dayOpen && selectedContractId === contractId) {
      focusSection(visitAnchor(visitId))
    }
  }

  function openReport(id: string, section?: EvidenceKind) {
    if (openReportId !== id && !allowLeaveReport()) return
    const anchor = section ? visitEvidenceAnchor(id, section) : reportAnchor(id)
    setOpenReportId(id)
    setFocusTarget(anchor)
    if (openReportId === id) focusSection(anchor)
  }

  function resumeReport(
    nextDate: string,
    contractId: string | null,
    visitId: string,
    section?: EvidenceKind,
  ) {
    if (openReportId !== visitId && !allowLeaveReport()) return
    setDate(nextDate)
    setSelectedContractId(contractId)
    setOpenReportId(visitId)
    const anchor = section ? visitEvidenceAnchor(visitId, section) : reportAnchor(visitId)
    setFocusTarget(anchor)
    setView('day')
    if (nextDate === date && dayOpen && openReportId === visitId) {
      focusSection(anchor)
    }
  }

  function statusProblem(id: string, message: string) {
    setVisitError({ id, message })
    toast.error(message)
  }

  async function changeStatus(visit: VisitSummary, nextStatus: 'in_progress' | 'completed') {
    if (!tenantId || !statusLock.acquire()) return
    setBusyId(visit.id)
    setVisitError(null)
    try {
      await applyStatus(tenantId, visit, nextStatus)
    } finally {
      setBusyId(null)
      statusLock.release()
    }
  }

  async function applyStatus(
    tenantId: string,
    visit: VisitSummary,
    nextStatus: 'in_progress' | 'completed',
  ) {
    if (nextStatus === 'completed' && reportGuard.current && openReportId === visit.id) {
      statusProblem(visit.id, 'Termina de guardar el parte antes de completar la visita.')
      return
    }
    let startLocation: { latitude: number; longitude: number } | null = null
    if (nextStatus === 'in_progress' && session?.role === 'user') {
      if (!navigator.geolocation) {
        statusProblem(
          visit.id,
          'Este dispositivo no permite compartir la ubicación requerida por la empresa.',
        )
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
        statusProblem(
          visit.id,
          'No se pudo obtener tu ubicación. Activa el permiso de ubicación en el navegador e inténtalo de nuevo.',
        )
        return
      }
    }
    if (nextStatus === 'completed' && session?.userId) {
      try {
        if ((await listPendingVisitPhotos(session.userId, tenantId, visit.id)).length > 0) {
          openReport(visit.id, 'photos')
          statusProblem(
            visit.id,
            'Envía o descarta las fotografías pendientes antes de completar la visita.',
          )
          return
        }
      } catch {
        openReport(visit.id, 'photos')
        statusProblem(
          visit.id,
          'No se pudo comprobar si hay fotografías pendientes en este dispositivo.',
        )
        return
      }
    }
    if (
      nextStatus === 'completed' &&
      session?.userId &&
      readVisitIncidentQueue(visitIncidentQueueKey(session.userId, tenantId, visit.id)).length > 0
    ) {
      openReport(visit.id, 'incidents')
      statusProblem(
        visit.id,
        'Envía o descarta las incidencias pendientes antes de completar la visita.',
      )
      return
    }
    if (
      nextStatus === 'completed' &&
      session?.userId &&
      readFieldEntryQueue(fieldEntryQueueKey(session.userId, tenantId, visit.id)).length > 0
    ) {
      openReport(visit.id, 'activity')
      statusProblem(
        visit.id,
        'Envía o descarta la actividad pendiente antes de completar la visita.',
      )
      return
    }
    if (
      nextStatus === 'completed' &&
      session?.userId &&
      readVisitReportLocalDraft(visitReportDraftKey(session.userId, tenantId, visit.id))
    ) {
      openReport(visit.id)
      statusProblem(
        visit.id,
        'Guarda o descarta el borrador del parte antes de completar la visita.',
      )
      return
    }
    const key = `${visit.id}:${nextStatus}:${visit.updated_at}`
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
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
      await queryClient.invalidateQueries({ queryKey: ['my-visits', tenantId] })
      toast.success(nextStatus === 'completed' ? 'Visita completada' : 'Visita iniciada')
    } catch (error) {
      statusProblem(
        visit.id,
        error instanceof Error
          ? error.message
          : 'No se pudo cambiar la visita. Inténtalo de nuevo.',
      )
      await queryClient.invalidateQueries({ queryKey: ['my-visits', tenantId] })
    }
  }

  return (
    <div className="worker-page space-y-6">
      {linkCompanyMismatch ? (
        <p role="alert">Esta visita pertenece a otra empresa. Cambia de empresa para verla.</p>
      ) : calendarVisit && calendarVisit.fecha === date && visits.isSuccess && !linkedVisit ? (
        <p role="alert">
          No se encuentra esta visita en tu jornada. Puede haber cambiado de fecha o asignación.
        </p>
      ) : null}
      <header className="worker-hero flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="worker-title">Mi jornada</h1>
          <p className="text-muted-foreground text-sm">
            Consulta tus visitas, cómo llegar y los partes de cada trabajo.
          </p>
        </div>
        <div className="worker-day-controls">
          <fieldset className="border-border bg-card grid grid-cols-2 rounded-lg border p-1 sm:flex">
            <legend className="sr-only">Vista de mi jornada</legend>
            {dayViews.map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                className="min-h-11"
                variant={view === key ? 'default' : 'ghost'}
                aria-pressed={view === key}
                onPress={() => changeView(key)}
              >
                {label}
              </Button>
            ))}
          </fieldset>
          {dayOpen ? (
            <>
              <Button
                variant="outline"
                className="min-h-10"
                onPress={() => goToDate(todayInMadrid())}
              >
                Hoy
              </Button>
              <div className="worker-day-picker">
                <Button
                  variant="outline"
                  className="size-10 p-0"
                  aria-label="Día anterior"
                  onPress={() => goToDate((current) => moveDays(current, -1))}
                >
                  <CaretLeftIcon aria-hidden="true" />
                </Button>
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
                  <span className="sr-only">Día</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => {
                      if (event.target.value) goToDate(event.target.value)
                    }}
                    className="border-input bg-background h-10 w-full min-w-0 rounded-lg border px-3 py-2"
                  />
                </label>
                <Button
                  variant="outline"
                  className="size-10 p-0"
                  aria-label="Día siguiente"
                  onPress={() => goToDate((current) => moveDays(current, 1))}
                >
                  <CaretRightIcon aria-hidden="true" />
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </header>
      {calendarOpen && tenantId ? (
        <MyVisitsCalendar
          tenantId={tenantId}
          date={date}
          onDateChange={goToDate}
          onSelectDay={(nextDate) => {
            if (!allowLeaveReport()) return
            selectDay(nextDate)
            setView('day')
          }}
          onOpenVisit={openVisit}
        />
      ) : null}
      {tenantId && userId && view === 'history' ? (
        <WorkerClosedVisitHistory tenantId={tenantId} userId={userId} today={today} />
      ) : null}
      {tenantId && userId && view === 'evidence' ? (
        <WorkerPendingEvidence
          tenantId={tenantId}
          userId={userId}
          today={today}
          onOpen={resumeReport}
        />
      ) : null}
      <div hidden={!dayOpen} className="space-y-6">
        <section
          className="border-border bg-card grid gap-4 rounded-xl border p-4 sm:px-5"
          aria-label="Resumen de la jornada"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                <CalendarBlankIcon aria-hidden="true" />{' '}
                {date === today ? 'Hoy' : 'Día seleccionado'}
              </div>
              <time
                dateTime={date}
                className="block text-base font-semibold first-letter:uppercase"
              >
                {longDay.format(calendarDate(date))}
              </time>
            </div>
            {activeVisit ? (
              <Button
                variant="outline"
                className="min-h-11"
                onPress={() => openVisit(date, activeVisit.contract_id ?? null, activeVisit.id)}
              >
                <ClockIcon aria-hidden="true" /> Ir a la visita en curso
              </Button>
            ) : null}
          </div>
          {nextVisit ? (
            <WorkerNextVisit visit={nextVisit} today={today} now={now} onOpen={openVisit} />
          ) : previewNext ? (
            futureVisits.isError ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <p role="alert">No se pudo consultar la siguiente visita.</p>
                <Button size="sm" variant="outline" onPress={() => void futureVisits.refetch()}>
                  Reintentar
                </Button>
              </div>
            ) : (
              <output className="text-muted-foreground text-sm">
                {futureVisits.isPending
                  ? 'Buscando la siguiente visita…'
                  : 'Sin más visitas programadas para los próximos 7 días.'}
              </output>
            )
          ) : null}
          {visits.isSuccess ? (
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div className="bg-muted/60 min-w-0 rounded-lg p-2.5">
                <dt className="text-muted-foreground text-xs">Planificadas</dt>
                <dd className="text-lg font-semibold tabular-nums">{scheduled}</dd>
              </div>
              <div className="bg-primary/10 min-w-0 rounded-lg p-2.5">
                <dt className="text-xs">En curso</dt>
                <dd className="text-lg font-semibold tabular-nums">{activeVisits.length}</dd>
              </div>
              <div className="bg-muted/60 min-w-0 rounded-lg p-2.5">
                <dt className="text-muted-foreground text-xs">Completadas</dt>
                <dd className="text-lg font-semibold tabular-nums">{completed}</dd>
              </div>
            </dl>
          ) : null}
        </section>
        {tenantId && userId && dayOpen ? (
          <WorkerPendingReports
            dayVisits={dayVisits}
            tenantId={tenantId}
            today={today}
            userId={userId}
            onResume={resumeReport}
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
            description="No tienes visitas asignadas para este día."
            actionLabel="Ver calendario"
            onAction={() => changeView('calendar')}
          />
        ) : null}
        {groupVisitsByContractDay(visits.data ?? []).map((group) => {
          const cards = group.visits.map((visit) => (
            <article
              key={visit.id}
              id={visitAnchor(visit.id)}
              aria-label={visit.title}
              tabIndex={-1}
              className="focus-visible:outline-ring scroll-m-3 rounded-xl outline-offset-2"
            >
              <Card
                className={`worker-visit-card overflow-visible ${visit.status === 'in_progress' ? '!border-primary' : ''}`}
              >
                <CardHeader className="gap-2 pb-3">
                  {linkedVisit?.id === visit.id ? <p>Visita abierta desde tu calendario</p> : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>
                      <h3 className="wrap-break-word">{visit.title}</h3>
                    </CardTitle>
                    <WorkerVisitStatus status={visit.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="flex flex-wrap items-center gap-1 font-medium tabular-nums">
                    <ClockIcon aria-hidden="true" />
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
                  <VisitMapsAction
                    addressMayBeIncomplete
                    address={visit.address}
                    label={`Cómo llegar a ${visit.title} en Google Maps`}
                  />
                  {visit.notes ? <p className="whitespace-pre-line">{visit.notes}</p> : null}
                  {visit.work_order_id ? (
                    <section
                      aria-label="Tareas del servicio"
                      className="space-y-2 rounded-lg border p-3"
                    >
                      <h4 className="font-medium">Tareas del servicio</h4>
                      {tasks.isPending ? (
                        <p className="text-muted-foreground">Cargando tareas…</p>
                      ) : null}
                      {tasks.isError ? (
                        <div className="space-y-1">
                          <p role="alert" className="text-destructive">
                            No se pudieron cargar las tareas.
                          </p>
                          <Button size="sm" variant="outline" onPress={() => void tasks.refetch()}>
                            Volver a cargar tareas
                          </Button>
                        </div>
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
                                  <span>
                                    <span className="sr-only">
                                      {item.done ? 'Hecha: ' : 'Pendiente: '}
                                    </span>
                                    {item.label}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </section>
                  ) : null}
                  {visitError?.id === visit.id ? (
                    <p
                      role="alert"
                      className="bg-destructive/10 text-destructive rounded-md px-3 py-2"
                    >
                      {visitError.message}
                    </p>
                  ) : null}
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    {visit.status === 'scheduled' ? (
                      <Button
                        className="min-h-11"
                        isDisabled={Boolean(busyId)}
                        onPress={() => void changeStatus(visit, 'in_progress')}
                      >
                        {busyId === visit.id ? 'Iniciando…' : 'Iniciar visita'}
                      </Button>
                    ) : null}
                    {visit.status === 'in_progress' ? (
                      <Button
                        className="min-h-11"
                        isDisabled={Boolean(busyId)}
                        onPress={() => void changeStatus(visit, 'completed')}
                      >
                        {busyId === visit.id ? 'Completando…' : 'Completar visita'}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      className="min-h-11"
                      aria-expanded={openReportId === visit.id}
                      {...(openReportId === visit.id
                        ? { 'aria-controls': reportAnchor(visit.id) }
                        : {})}
                      onPress={() => {
                        if (openReportId === visit.id) {
                          if (!allowLeaveReport()) return
                          setOpenReportId(null)
                          setFocusTarget(null)
                        } else openReport(visit.id)
                      }}
                    >
                      <NotePencilIcon aria-hidden="true" />
                      {openReportId === visit.id
                        ? 'Ocultar parte'
                        : visit.status === 'completed'
                          ? 'Ver parte'
                          : 'Abrir parte'}
                    </Button>
                  </div>
                  {tenantId ? (
                    <WorkerPaperReport key={visit.id} tenantId={tenantId} visit={visit} />
                  ) : null}
                  {openReportId === visit.id && tenantId && session?.userId ? (
                    <section
                      id={reportAnchor(visit.id)}
                      aria-label={`Parte de ${visit.title}`}
                      tabIndex={-1}
                      className="focus-visible:outline-ring scroll-m-3 rounded-xl outline-offset-2"
                    >
                      <VisitReportEditor
                        key={`${session.userId}:${tenantId}:${visit.id}`}
                        visit={visit}
                        tenantId={tenantId}
                        userId={session.userId}
                        guardRef={reportGuard}
                      />
                    </section>
                  ) : null}
                </CardContent>
              </Card>
            </article>
          ))
          const contractId = group.visits[0]?.contract_id
          return contractId ? (
            <details
              key={group.id}
              open={
                selectedContractId === contractId ||
                (!linkedGroupDismissed && linkedVisit?.contract_id === contractId) ||
                undefined
              }
              onToggle={(event) => {
                if (!event.currentTarget.open && linkedVisit?.contract_id === contractId) {
                  setLinkedGroupDismissed(true)
                }
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
        {visits.isSuccess && dayVisits.length > 0 && tenantId ? (
          <WorkerBatchPaperReports
            key={`${tenantId}:${date}`}
            tenantId={tenantId}
            visits={dayVisits}
            disabled={visits.isFetching}
          />
        ) : null}
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
