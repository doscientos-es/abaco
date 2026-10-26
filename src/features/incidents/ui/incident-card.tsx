import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  listIncidentEvents,
  loadIncident,
  updateIncident,
  type Incident,
  type IncidentCoverage,
  type IncidentPriority,
  type IncidentStatus,
} from '../application/incident-actions'
import { IncidentConversions } from './incident-conversions'

const statusLabels: Record<IncidentStatus, string> = {
  open: 'Abierta',
  in_progress: 'En curso',
  resolved: 'Resuelta',
  reopened: 'Reabierta',
  canceled: 'Cancelada',
}
const priorityLabels: Record<IncidentPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}
const coverageLabels: Record<IncidentCoverage, string> = {
  unassessed: 'Sin evaluar',
  contract: 'Contrato',
  warranty: 'Garantía',
  chargeable: 'Facturable',
  excluded: 'Excluida',
}

type Draft = {
  baseUpdatedAt: string
  status: IncidentStatus
  priority: IncidentPriority
  assignedUserId: string | null
  dueAt: string
  coverageKind: IncidentCoverage
  coverageEvidence: string
  diagnosis: string
  resolution: string
}

function localDateTime(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function fromIncident(incident: Incident): Draft {
  return {
    baseUpdatedAt: incident.updated_at,
    status: incident.status,
    priority: incident.priority,
    assignedUserId: incident.assigned_user_id,
    dueAt: localDateTime(incident.due_at),
    coverageKind: incident.coverage_kind,
    coverageEvidence: incident.coverage_evidence,
    diagnosis: incident.diagnosis,
    resolution: incident.resolution,
  }
}

function allowedStatuses(status: IncidentStatus, office: boolean): IncidentStatus[] {
  const next: Record<IncidentStatus, IncidentStatus[]> = {
    open: ['in_progress', 'resolved', 'canceled'],
    in_progress: ['resolved', 'canceled'],
    resolved: ['reopened'],
    reopened: ['in_progress', 'resolved', 'canceled'],
    canceled: [],
  }
  return [status, ...next[status].filter((value) => office || value !== 'canceled')]
}

function eventLabel(event: {
  kind: 'created' | 'updated'
  before_state: { status?: IncidentStatus; coverage_kind?: IncidentCoverage } | null
  after_state: { status?: IncidentStatus; coverage_kind?: IncidentCoverage }
}) {
  if (event.kind === 'created') return 'Creada'
  if (event.before_state?.status !== event.after_state.status)
    return `${statusLabels[event.before_state?.status ?? 'open']} → ${statusLabels[event.after_state.status ?? 'open']}`
  if (event.before_state?.coverage_kind !== event.after_state.coverage_kind)
    return `Cobertura: ${coverageLabels[event.before_state?.coverage_kind ?? 'unassessed']} → ${coverageLabels[event.after_state.coverage_kind ?? 'unassessed']}`
  return 'Datos o diagnóstico actualizados'
}

export function IncidentCard({
  incident,
  tenantId,
  office,
  assignees,
  contextLabel,
  onSaved,
}: {
  incident: Incident
  tenantId: string
  office: boolean
  assignees: { id: string; label: string }[]
  contextLabel?: string
  onSaved: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editing, setEditing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [eventsPage, setEventsPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())
  const data = draft ?? fromIncident(incident)
  const conflict = draft !== null && draft.baseUpdatedAt !== incident.updated_at
  const eventsKey = ['incident-events', tenantId, incident.id, eventsPage]
  const events = useQuery({
    queryKey: eventsKey,
    queryFn: () => listIncidentEvents(tenantId, incident.id, eventsPage),
    enabled: showHistory,
  })

  function change(patch: Partial<Draft>) {
    setDraft({ ...data, ...patch })
  }

  async function save() {
    if (busy || conflict) return
    const dueDate = data.dueAt ? new Date(data.dueAt) : null
    if (dueDate && !Number.isFinite(dueDate.getTime())) return toast.error('Revisa el plazo')
    if ((data.status === 'resolved' || data.status === 'canceled') && !data.resolution.trim()) {
      return toast.error('Indica la resolución o el motivo de cancelación')
    }
    if (data.coverageKind !== 'unassessed' && data.coverageEvidence.trim().length < 5) {
      return toast.error('Justifica la cobertura antes de guardarla')
    }
    const payload = {
      tenantId,
      incidentId: incident.id,
      expectedUpdatedAt: data.baseUpdatedAt,
      status: data.status,
      priority: data.priority,
      assignedUserId: data.assignedUserId,
      dueAt: dueDate?.toISOString() ?? null,
      coverageKind: data.coverageKind,
      coverageEvidence: data.coverageEvidence.trim(),
      diagnosis: data.diagnosis.trim(),
      resolution: data.resolution.trim(),
    }
    const key = JSON.stringify(payload)
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await updateIncident({ ...payload, operationId })
      operations.current.delete(key)
      setDraft(null)
      setEditing(false)
      await onSaved()
      await queryClient.invalidateQueries({ queryKey: ['incident-events', tenantId, incident.id] })
      setEventsPage(0)
      toast.success('Incidencia actualizada')
    } catch (error) {
      let confirmed = false
      try {
        const current = await loadIncident(tenantId, incident.id)
        confirmed = Boolean(
          current &&
          current.status === payload.status &&
          current.priority === payload.priority &&
          current.assigned_user_id === payload.assignedUserId &&
          (current.due_at === payload.dueAt ||
            (current.due_at !== null &&
              payload.dueAt !== null &&
              new Date(current.due_at).getTime() === new Date(payload.dueAt).getTime())) &&
          current.coverage_kind === payload.coverageKind &&
          current.coverage_evidence === payload.coverageEvidence &&
          current.diagnosis === payload.diagnosis &&
          current.resolution === payload.resolution,
        )
      } catch {
        // The retry keeps its operation ID until connectivity returns.
      }
      if (confirmed) {
        operations.current.delete(key)
        setDraft(null)
        setEditing(false)
        await onSaved()
        await queryClient.invalidateQueries({
          queryKey: ['incident-events', tenantId, incident.id],
        })
        setEventsPage(0)
        toast.success('Guardado confirmado')
        return
      }
      await onSaved()
      toast.error('No se pudo actualizar la incidencia', {
        description: error instanceof Error ? error.message : 'Revisa los cambios y reintenta.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="border-border space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold">{incident.title}</h4>
          <p className="text-muted-foreground">
            {statusLabels[incident.status]} · Prioridad {priorityLabels[incident.priority]} ·
            Cobertura {coverageLabels[incident.coverage_kind]}
          </p>
        </div>
        {incident.status !== 'canceled' ? (
          <Button size="sm" variant="outline" onPress={() => setEditing(!editing)}>
            {editing ? 'Ocultar edición' : 'Gestionar'}
          </Button>
        ) : null}
      </div>
      <p className="whitespace-pre-line">{incident.description}</p>
      {contextLabel ? <p className="text-muted-foreground">{contextLabel}</p> : null}
      {incident.due_at ? <p>Plazo: {new Date(incident.due_at).toLocaleString('es-ES')}</p> : null}
      {incident.diagnosis ? (
        <p>
          <strong>Diagnóstico:</strong> {incident.diagnosis}
        </p>
      ) : null}
      {incident.resolution ? (
        <p>
          <strong>Resolución:</strong> {incident.resolution}
        </p>
      ) : null}
      {office ? (
        <IncidentConversions incident={incident} tenantId={tenantId} assignees={assignees} />
      ) : null}
      {editing ? (
        <div className="border-border grid gap-3 border-t pt-3 sm:grid-cols-2">
          {conflict ? (
            <div role="alert" className="border-warning rounded-lg border p-3 sm:col-span-2">
              <p>
                La incidencia cambió en otra sesión. Estado de la empresa:{' '}
                {statusLabels[incident.status]}; tu versión: {statusLabels[data.status]}.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onPress={() => setDraft(null)}>
                  Usar versión de la empresa
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => setDraft({ ...data, baseUpdatedAt: incident.updated_at })}
                >
                  Seguir con mi versión tras revisarla
                </Button>
              </div>
            </div>
          ) : null}
          <label>
            Estado{' '}
            <select
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              value={data.status}
              onChange={(event) =>
                change({
                  status: event.target.value as IncidentStatus,
                  resolution: event.target.value === 'reopened' ? '' : data.resolution,
                })
              }
            >
              {allowedStatuses(incident.status, office).map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          {office ? (
            <label>
              Prioridad{' '}
              <select
                className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                value={data.priority}
                onChange={(event) => change({ priority: event.target.value as IncidentPriority })}
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {office ? (
            <label>
              Responsable{' '}
              <select
                className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                value={data.assignedUserId ?? ''}
                onChange={(event) => change({ assignedUserId: event.target.value || null })}
              >
                <option value="">Sin asignar</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {office ? (
            <label>
              Plazo{' '}
              <input
                className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                type="datetime-local"
                value={data.dueAt}
                onChange={(event) => change({ dueAt: event.target.value })}
              />
            </label>
          ) : null}
          {office ? (
            <label>
              Cobertura{' '}
              <select
                className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                value={data.coverageKind}
                onChange={(event) =>
                  change({ coverageKind: event.target.value as IncidentCoverage })
                }
              >
                {Object.entries(coverageLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {office ? (
            <label className="sm:col-span-2">
              Justificación de cobertura{' '}
              <textarea
                className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                value={data.coverageEvidence}
                maxLength={1000}
                onChange={(event) => change({ coverageEvidence: event.target.value })}
              />
            </label>
          ) : null}
          <label className="sm:col-span-2">
            Diagnóstico{' '}
            <textarea
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              value={data.diagnosis}
              maxLength={4000}
              onChange={(event) => change({ diagnosis: event.target.value })}
            />
          </label>
          <label className="sm:col-span-2">
            Resolución o motivo de cancelación{' '}
            <textarea
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              value={data.resolution}
              maxLength={4000}
              onChange={(event) => change({ resolution: event.target.value })}
            />
          </label>
          <div className="sm:col-span-2">
            <Button isDisabled={busy || conflict} onPress={() => void save()}>
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      ) : null}
      <div>
        <Button size="sm" variant="ghost" onPress={() => setShowHistory(!showHistory)}>
          {showHistory ? 'Ocultar historial' : 'Ver historial'}
        </Button>
        {showHistory ? (
          events.isError ? (
            <p role="alert" className="text-destructive">
              No se pudo cargar el historial.
            </p>
          ) : (
            <>
              <ol className="mt-2 space-y-1">
                {events.data?.events.map((event) => (
                  <li key={event.operation_id}>
                    {new Date(event.occurred_at).toLocaleString('es-ES')} · {eventLabel(event)}
                  </li>
                ))}
              </ol>
              {(events.data?.count ?? 0) > 0 ? (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={eventsPage === 0}
                    onPress={() => setEventsPage(eventsPage - 1)}
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {eventsPage + 1} de{' '}
                    {Math.ceil((events.data?.count ?? 0) / (events.data?.pageSize ?? 20))}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={
                      (eventsPage + 1) * (events.data?.pageSize ?? 20) >= (events.data?.count ?? 0)
                    }
                    onPress={() => setEventsPage(eventsPage + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              ) : null}
            </>
          )
        ) : null}
      </div>
    </article>
  )
}
