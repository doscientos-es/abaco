import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import type { ClientPassport } from '@/features/clients/application/client-passport-actions'

import {
  createIncident,
  listIncidentAssignees,
  listIncidents,
  type Incident,
  type IncidentPriority,
} from '../application/incident-actions'
import {
  readVisitIncidentQueue,
  visitIncidentQueueKey,
  writeVisitIncidentQueue,
  type PendingVisitIncident,
} from '../application/incident-queue'
import { IncidentCard } from './incident-card'

const priorities: { value: IncidentPriority; label: string }[] = [
  { value: 'low', label: 'Baja' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
]

type Props = {
  tenantId: string
  userId: string
  clientId?: string
  visitId?: string
  passport?: ClientPassport
}

function incidentContext(incident: Incident, passport?: ClientPassport) {
  if (!passport) return ''
  return [
    passport.locations.find((item) => item.id === incident.location_id)?.name,
    passport.assets.find((item) => item.id === incident.asset_id)?.name,
    passport.equipment.find((item) => item.id === incident.equipment_id)?.kind,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function IncidentPanel({ tenantId, userId, clientId, visitId, passport }: Props) {
  const session = useSession()
  const office = can(session?.role, 'visits:write')
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const filter = visitId ? { visitId } : clientId ? { clientId } : {}
  const queryKey = ['incidents', tenantId, visitId ?? clientId, page]
  const incidents = useQuery({
    queryKey,
    queryFn: () => listIncidents(tenantId, filter, page),
  })
  const assignees = useQuery({
    queryKey: ['incident-assignees', tenantId],
    queryFn: () => listIncidentAssignees(tenantId),
    enabled: office,
  })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<IncidentPriority>('normal')
  const [locationId, setLocationId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())
  const queueKey = visitId ? visitIncidentQueueKey(userId, tenantId, visitId) : ''
  const [queue, setQueue] = useState(() => (visitId ? readVisitIncidentQueue(queueKey) : []))
  const [storageFailed, setStorageFailed] = useState(false)
  const assetOptions = (passport?.assets ?? []).filter((asset) => asset.location_id === locationId)
  const equipmentOptions = (passport?.equipment ?? []).filter(
    (equipment) => equipment.asset_id === assetId,
  )
  const selectedEquipment = equipmentOptions.find((equipment) => equipment.id === equipmentId)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['incidents', tenantId, visitId ?? clientId] })
    setPage(0)
  }

  async function sendVisit(item: PendingVisitIncident) {
    if (!visitId) return
    await createIncident({
      tenantId,
      clientId: null,
      locationId: null,
      assetId: null,
      equipmentId: null,
      sourceVisitId: visitId,
      title: item.title,
      description: item.description,
      priority: item.priority,
      assignedUserId: null,
      dueAt: null,
      operationId: item.operationId,
    })
    const next = readVisitIncidentQueue(queueKey).filter(
      (pending) => pending.operationId !== item.operationId,
    )
    setStorageFailed(!writeVisitIncidentQueue(queueKey, next))
    setQueue(next)
    await refresh()
  }

  async function createFromVisit() {
    if (!visitId || busy || !title.trim() || !description.trim()) return
    const item: PendingVisitIncident = {
      operationId: crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      priority,
    }
    const next = [...queue, item]
    if (!writeVisitIncidentQueue(queueKey, next)) {
      setStorageFailed(true)
      toast.error('No se pudo conservar la incidencia en este dispositivo')
      return
    }
    setQueue(next)
    setBusy(true)
    try {
      await sendVisit(item)
      setTitle('')
      setDescription('')
      toast.success('Incidencia creada')
    } catch (error) {
      toast.error('Incidencia pendiente de envío', {
        description:
          error instanceof Error ? error.message : 'Reintenta cuando vuelva la conexión.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function retry(item: PendingVisitIncident) {
    if (busy) return
    setBusy(true)
    try {
      await sendVisit(item)
      toast.success('Incidencia creada')
    } catch (error) {
      toast.error('No se pudo enviar la incidencia', {
        description: error instanceof Error ? error.message : 'Reintenta más tarde.',
      })
    } finally {
      setBusy(false)
    }
  }

  function discard(item: PendingVisitIncident) {
    if (!window.confirm('¿Descartar esta incidencia pendiente? No se enviará a la empresa.')) return
    const next = queue.filter((pending) => pending.operationId !== item.operationId)
    if (!writeVisitIncidentQueue(queueKey, next)) {
      setStorageFailed(true)
      toast.error('No se pudo descartar la incidencia del dispositivo')
      return
    }
    setQueue(next)
  }

  async function createFromClient() {
    if (!clientId || !office || busy || !title.trim() || !description.trim()) return
    const dueDate = dueAt ? new Date(dueAt) : null
    if (dueDate && !Number.isFinite(dueDate.getTime())) return toast.error('Revisa el plazo')
    const payload = {
      tenantId,
      clientId,
      locationId: locationId || null,
      assetId: assetId || null,
      equipmentId: equipmentId || null,
      sourceVisitId: null,
      title: title.trim(),
      description: description.trim(),
      priority,
      assignedUserId: assignedUserId || null,
      dueAt: dueDate?.toISOString() ?? null,
    }
    const key = JSON.stringify(payload)
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await createIncident({ ...payload, operationId })
      operations.current.delete(key)
      setTitle('')
      setDescription('')
      await refresh()
      toast.success('Incidencia creada')
    } catch (error) {
      await refresh()
      toast.error('No se pudo crear la incidencia', {
        description: error instanceof Error ? error.message : 'Revisa los datos y reintenta.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-border space-y-4 border-t pt-4" aria-label="Incidencias">
      <h3 className="font-semibold">Incidencias</h3>
      {incidents.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar las incidencias.
        </p>
      ) : null}
      {visitId || office ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Título{' '}
            <input
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Prioridad{' '}
            <select
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              value={priority}
              onChange={(event) => setPriority(event.target.value as IncidentPriority)}
            >
              {priorities.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            Descripción{' '}
            <textarea
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              value={description}
              maxLength={4000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {!visitId && passport ? (
            <>
              <label className="text-sm">
                Ubicación{' '}
                <select
                  className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                  value={locationId}
                  onChange={(event) => {
                    setLocationId(event.target.value)
                    setAssetId('')
                    setEquipmentId('')
                  }}
                >
                  <option value="">Sin ubicación</option>
                  {passport.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Activo{' '}
                <select
                  className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                  value={assetId}
                  onChange={(event) => {
                    setAssetId(event.target.value)
                    setEquipmentId('')
                  }}
                >
                  <option value="">Sin activo</option>
                  {assetOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Equipo{' '}
                <select
                  className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                  value={equipmentId}
                  onChange={(event) => setEquipmentId(event.target.value)}
                >
                  <option value="">Sin equipo</option>
                  {equipmentOptions.map((equipment) => (
                    <option key={equipment.id} value={equipment.id}>
                      {equipment.kind} {equipment.model}
                    </option>
                  ))}
                </select>
                {selectedEquipment?.warranty_ends_at ? (
                  <span className="text-muted-foreground block text-xs">
                    Garantía registrada hasta {selectedEquipment.warranty_ends_at}; comprueba su
                    cobertura.
                  </span>
                ) : null}
              </label>
              <label className="text-sm">
                Responsable{' '}
                <select
                  className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                  value={assignedUserId}
                  onChange={(event) => setAssignedUserId(event.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {assignees.data?.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Plazo{' '}
                <input
                  className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </label>
            </>
          ) : null}
          <div className="sm:col-span-2">
            <Button
              isDisabled={busy || !title.trim() || !description.trim()}
              onPress={() => void (visitId ? createFromVisit() : createFromClient())}
            >
              {busy ? 'Guardando…' : 'Crear incidencia'}
            </Button>
          </div>
        </div>
      ) : null}
      {storageFailed ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudo actualizar la copia local. Comprueba el historial antes de salir.
        </p>
      ) : null}
      {queue.length ? (
        <div className="border-warning rounded-lg border p-3 text-sm">
          <p className="font-medium">Incidencias pendientes en este dispositivo</p>
          <ul className="mt-2 space-y-2">
            {queue.map((item) => (
              <li key={item.operationId} className="flex flex-wrap items-center gap-2">
                <span>{item.title}</span>
                <Button
                  size="sm"
                  variant="outline"
                  isDisabled={busy}
                  onPress={() => void retry(item)}
                >
                  Reintentar
                </Button>
                <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => discard(item)}>
                  Descartar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!incidents.data?.incidents.length ? (
        <p className="text-muted-foreground text-sm">Aún no hay incidencias registradas.</p>
      ) : (
        <div className="space-y-3">
          {incidents.data.incidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              tenantId={tenantId}
              office={office}
              assignees={assignees.data ?? []}
              contextLabel={incidentContext(incident, passport)}
              onSaved={refresh}
            />
          ))}
        </div>
      )}
      {(incidents.data?.count ?? 0) > 0 ? (
        <div className="flex items-center gap-3 text-sm">
          <Button
            size="sm"
            variant="outline"
            isDisabled={page === 0}
            onPress={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span>
            Página {page + 1} de{' '}
            {Math.ceil((incidents.data?.count ?? 0) / (incidents.data?.pageSize ?? 20))}
          </span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={
              (page + 1) * (incidents.data?.pageSize ?? 20) >= (incidents.data?.count ?? 0)
            }
            onPress={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </section>
  )
}
