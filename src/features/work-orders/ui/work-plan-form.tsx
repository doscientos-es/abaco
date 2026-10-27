import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { SelectField, TextField, TextareaField } from '@/shared/ui/form'

import {
  loadWorkMemberOptions,
  updateWorkOrderPlan,
  type WorkOrder,
} from '../application/work-order-actions'

function toLocalInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toUtc(value: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('Comprueba la fecha y hora previstas.')
  return parsed.toISOString()
}

export function WorkPlanForm({
  tenantId,
  order,
  onSaved,
}: {
  tenantId: string
  order: WorkOrder
  onSaved: () => Promise<void>
}) {
  const members = useQuery({
    queryKey: ['work-member-options', tenantId],
    queryFn: () => loadWorkMemberOptions(tenantId),
  })
  const [responsibleId, setResponsibleId] = useState(order.responsible_user_id ?? '')
  const [startAt, setStartAt] = useState(toLocalInput(order.planned_start_at))
  const [endAt, setEndAt] = useState(toLocalInput(order.planned_end_at))
  const [description, setDescription] = useState(order.description)
  const [saving, setSaving] = useState(false)
  const operationId = useRef(crypto.randomUUID())

  function changed() {
    operationId.current = crypto.randomUUID()
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const plannedStartAt = toUtc(startAt)
      const plannedEndAt = toUtc(endAt)
      if (plannedStartAt && plannedEndAt && plannedEndAt < plannedStartAt)
        throw new Error('El final previsto debe ser posterior al inicio.')
      await updateWorkOrderPlan({
        tenantId,
        workOrder: order,
        responsibleUserId: responsibleId || null,
        plannedStartAt,
        plannedEndAt,
        description,
        operationId: operationId.current,
      })
      await onSaved()
      toast.success('Planificación guardada')
    } catch (error) {
      toast.error('No se pudo guardar la planificación', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planificación</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {members.isError ? (
          <p role="alert" className="text-destructive sm:col-span-2">
            No se pudo cargar el equipo: {members.error.message}
          </p>
        ) : null}
        <SelectField
          label="Responsable"
          value={responsibleId}
          options={[
            { value: '', label: 'Sin asignar' },
            ...(members.data ?? []).map((member) => ({ value: member.id, label: member.label })),
          ]}
          onChange={(value) => {
            setResponsibleId(value)
            changed()
          }}
        />
        <div />
        <TextField
          label="Inicio previsto"
          type="datetime-local"
          value={startAt}
          onChange={(value) => {
            setStartAt(value)
            changed()
          }}
          placeholder="Inicio previsto"
        />
        <TextField
          label="Fin previsto"
          type="datetime-local"
          value={endAt}
          onChange={(value) => {
            setEndAt(value)
            changed()
          }}
          placeholder="Fin previsto"
        />
        <TextareaField
          label="Notas operativas"
          value={description}
          onChange={(value) => {
            setDescription(value)
            changed()
          }}
          placeholder="Preparación y detalles de ejecución"
          maxLength={4000}
          className="sm:col-span-2"
        />
        <div className="sm:col-span-2">
          <Button isDisabled={saving || members.isPending} onPress={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar planificación'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
