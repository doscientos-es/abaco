import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
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
import {
  measurementQueueKey,
  readMeasurementQueue,
} from '@/features/measurements/application/measurement-queue'

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
import { VisitReportEditor } from './visit-report-editor'

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

export function MyDayPage() {
  const session = useSession()
  const tenantId = session?.tenantId
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayInMadrid)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openReportId, setOpenReportId] = useState<string | null>(null)
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

  async function changeStatus(visit: VisitSummary, nextStatus: 'in_progress' | 'completed') {
    if (!tenantId || busyId) return
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
      readMeasurementQueue(measurementQueueKey(session.userId, tenantId, visit.id)).length > 0
    ) {
      setOpenReportId(visit.id)
      toast.error('Envía las mediciones pendientes antes de completar la visita.')
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mi jornada</h1>
          <p className="text-muted-foreground text-sm">Solo aparecen las visitas asignadas a ti.</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Día
          <input
            type="date"
            value={date}
            onChange={(event) => {
              if (event.target.value) setDate(event.target.value)
            }}
            className="border-input bg-background rounded-lg border px-3 py-2"
          />
        </label>
      </div>
      {visits.isPending ? <output>Cargando visitas…</output> : null}
      {visits.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudo cargar tu jornada: {visits.error.message}
        </p>
      ) : null}
      {visits.data?.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-5 text-sm">
          No tienes visitas asignadas para este día.
        </p>
      ) : null}
      {visits.data?.map((visit) => (
        <Card key={visit.id}>
          <CardHeader>
            <CardTitle>{visit.title}</CardTitle>
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
              · {statusLabels[visit.status]} · {visit.timezone}
            </p>
            <p>{visit.client_name}</p>
            {visit.location_name ? <p>{visit.location_name}</p> : null}
            {visit.address ? (
              <div className="space-y-1">
                <p className="text-muted-foreground">{visit.address}</p>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(visit.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-block font-medium underline"
                >
                  Cómo llegar
                </a>
              </div>
            ) : null}
            {visit.notes ? <p className="whitespace-pre-line">{visit.notes}</p> : null}
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
      ))}
    </div>
  )
}
