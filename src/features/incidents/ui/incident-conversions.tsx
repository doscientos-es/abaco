import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { currentTenantData, refreshStore } from '@/shared/store/store'

import {
  convertIncident,
  listIncidentConversions,
  loadIncidentTimezone,
  type Incident,
  type IncidentConversionKind,
} from '../application/incident-actions'

const labels: Record<IncidentConversionKind, string> = {
  estimate: 'Presupuesto',
  work: 'Trabajo',
  visit: 'Visita',
}

export function IncidentConversions({
  incident,
  tenantId,
  assignees,
}: {
  incident: Incident
  tenantId: string
  assignees: { id: string; label: string }[]
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [visitOpen, setVisitOpen] = useState(false)
  const [localStart, setLocalStart] = useState('')
  const [duration, setDuration] = useState(60)
  const [assignedUserId, setAssignedUserId] = useState(incident.assigned_user_id ?? '')
  const [busy, setBusy] = useState<IncidentConversionKind | null>(null)
  const operations = useRef(new Map<string, string>())
  const queryKey = ['incident-conversions', tenantId, incident.id]
  const conversions = useQuery({
    queryKey,
    queryFn: () => listIncidentConversions(tenantId, incident.id),
  })
  const timezone = useQuery({
    queryKey: ['incident-timezone', tenantId, incident.location_id],
    queryFn: () => loadIncidentTimezone(tenantId, incident.location_id),
    enabled: visitOpen,
  })
  const existing = new Map(conversions.data?.map((item) => [item.kind, item]))

  async function create(kind: IncidentConversionKind) {
    if (busy || conversions.isPending || conversions.isError || existing.has(kind)) return
    if (kind === 'visit' && (!localStart || duration < 15 || duration > 720)) {
      toast.error('Indica una fecha y una duración entre 15 y 720 minutos')
      return
    }
    const payload = {
      tenantId,
      incidentId: incident.id,
      kind,
      localStart: kind === 'visit' ? localStart : null,
      durationMinutes: kind === 'visit' ? duration : null,
      assignedUserId: kind === 'visit' ? assignedUserId || null : null,
    }
    const key = JSON.stringify(payload)
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
    setBusy(kind)
    try {
      const destinationId = await convertIncident({ ...payload, operationId })
      operations.current.delete(key)
      await queryClient.invalidateQueries({ queryKey })
      if (kind === 'estimate') {
        await refreshStore()
        if (currentTenantData()?.estimates.some((item) => item.id === destinationId)) {
          toast.success('Presupuesto borrador creado')
          void navigate({ to: '/presupuestos/$estimateId', params: { estimateId: destinationId } })
        } else {
          toast.success('Presupuesto creado. Actualiza la página para abrirlo.')
        }
      } else if (kind === 'work') {
        await queryClient.invalidateQueries({ queryKey: ['work-orders', tenantId] })
        toast.success('Trabajo creado')
        void navigate({ to: '/trabajos/$workOrderId', params: { workOrderId: destinationId } })
      } else {
        setVisitOpen(false)
        await queryClient.invalidateQueries({ queryKey: ['office-visits', tenantId] })
        toast.success('Visita programada')
      }
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey })
      toast.error(`No se pudo crear el ${labels[kind].toLowerCase()}`, {
        description:
          error instanceof Error ? error.message : 'Revisa los datos e inténtalo de nuevo.',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      className="border-border space-y-3 border-t pt-3"
      aria-label="Destinos de la incidencia"
    >
      <h5 className="font-medium">Convertir incidencia</h5>
      {conversions.isError ? (
        <p role="alert" className="text-destructive">
          No se pudieron cargar los destinos. Reintenta antes de convertir.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(['estimate', 'work', 'visit'] as const).map((kind) => {
          const destination = existing.get(kind)
          if (destination) {
            if (kind === 'estimate' && destination.estimate_id) {
              return (
                <Link
                  key={kind}
                  to="/presupuestos/$estimateId"
                  params={{ estimateId: destination.estimate_id }}
                  className="text-primary rounded-lg border px-3 py-1.5 font-medium underline"
                >
                  Abrir presupuesto
                </Link>
              )
            }
            if (kind === 'work' && destination.work_order_id) {
              return (
                <Link
                  key={kind}
                  to="/trabajos/$workOrderId"
                  params={{ workOrderId: destination.work_order_id }}
                  className="text-primary rounded-lg border px-3 py-1.5 font-medium underline"
                >
                  Abrir trabajo
                </Link>
              )
            }
            return (
              <Link
                key={kind}
                to="/agenda"
                className="text-primary rounded-lg border px-3 py-1.5 font-medium underline"
              >
                Ver visita en agenda
              </Link>
            )
          }
          if (incident.status === 'canceled') return null
          return (
            <Button
              key={kind}
              size="sm"
              variant="outline"
              isDisabled={Boolean(busy) || conversions.isPending || conversions.isError}
              onPress={() =>
                kind === 'visit' ? setVisitOpen((shown) => !shown) : void create(kind)
              }
            >
              {busy === kind ? 'Creando…' : `Crear ${labels[kind].toLowerCase()}`}
            </Button>
          )
        })}
      </div>
      {visitOpen && !existing.has('visit') && incident.status !== 'canceled' ? (
        <div className="bg-muted grid gap-3 rounded-lg p-3 sm:grid-cols-3">
          <label>
            Inicio local ({timezone.data ?? 'zona de la ubicación'})
            <input
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              type="datetime-local"
              value={localStart}
              onChange={(event) => setLocalStart(event.target.value)}
            />
          </label>
          <label>
            Duración (minutos)
            <input
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              type="number"
              min={15}
              max={720}
              step={15}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </label>
          <label>
            Responsable
            <select
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              value={assignedUserId}
              onChange={(event) => setAssignedUserId(event.target.value)}
            >
              <option value="">Sin asignar</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-3">
            {timezone.isError ? (
              <p role="alert" className="text-destructive mb-2">
                No se pudo comprobar la zona horaria de la ubicación.
              </p>
            ) : null}
            <Button
              size="sm"
              isDisabled={Boolean(busy) || timezone.isPending || timezone.isError}
              onPress={() => void create('visit')}
            >
              {busy === 'visit' ? 'Programando…' : 'Programar visita'}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
