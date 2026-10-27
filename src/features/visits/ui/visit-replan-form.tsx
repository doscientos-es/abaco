import { Button, toast } from '@doscientos/ui'
import { useRef, useState } from 'react'

import { SelectField, TextField } from '@/shared/ui/form'

import {
  replanServiceVisit,
  type TechnicianOption,
  type VisitSummary,
} from '../application/visit-actions'

function localDateTime(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(instant))
    .replace(' ', 'T')
}

export function VisitReplanForm({
  tenantId,
  visit,
  technicians,
  onDone,
  onCancel,
}: {
  tenantId: string
  visit: VisitSummary
  technicians: TechnicianOption[]
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [localStart, setLocalStart] = useState(() =>
    localDateTime(visit.scheduled_start_at, visit.timezone),
  )
  const [duration, setDuration] = useState(() =>
    String(
      Math.round(
        (Date.parse(visit.scheduled_end_at) - Date.parse(visit.scheduled_start_at)) / 60_000,
      ),
    ),
  )
  const [assignedUserId, setAssignedUserId] = useState(visit.assigned_user_id ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const operationIds = useRef(new Map<string, string>())
  const durationMinutes = Number(duration)
  const valid =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localStart) &&
    Number.isInteger(durationMinutes) &&
    durationMinutes >= 15 &&
    durationMinutes <= 720 &&
    reason.trim().length > 0 &&
    reason.trim().length <= 500

  async function save() {
    if (busy || !valid) return
    const payload = {
      tenantId,
      visitId: visit.id,
      expectedUpdatedAt: visit.updated_at,
      localStart,
      durationMinutes,
      assignedUserId: assignedUserId || null,
      reason: reason.trim(),
    }
    const key = JSON.stringify(payload)
    let operationId = operationIds.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operationIds.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await replanServiceVisit({ ...payload, operationId })
      operationIds.current.delete(key)
      await onDone()
      toast.success('Visita reprogramada')
    } catch (error) {
      toast.error('No se pudo reprogramar la visita', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-muted/40 mt-3 w-full space-y-3 rounded-lg border p-4">
      <p className="font-medium">Reprogramar «{visit.title}»</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Nuevo inicio local"
          type="datetime-local"
          value={localStart}
          onChange={setLocalStart}
          placeholder="Fecha y hora"
          helper={`Zona horaria: ${visit.timezone}`}
        />
        <TextField
          label="Duración en minutos"
          type="number"
          value={duration}
          onChange={setDuration}
          placeholder="60"
          min={15}
          max={720}
        />
        <SelectField
          label="Técnico"
          value={assignedUserId}
          options={[
            { value: '', label: 'Pendiente de asignar' },
            ...technicians.map((person) => ({ value: person.id, label: person.label })),
          ]}
          onChange={setAssignedUserId}
        />
        <TextField
          label="Motivo del cambio"
          value={reason}
          onChange={setReason}
          maxLength={500}
          placeholder="Ejemplo: petición del cliente"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={busy || !valid} onPress={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar cambio'}
        </Button>
        <Button variant="ghost" isDisabled={busy} onPress={onCancel}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}
