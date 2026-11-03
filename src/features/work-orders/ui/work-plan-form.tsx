import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { assignableWorkTeams, workTeamLabel, workTeamsQuery } from '@/features/work-teams'
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
  const session = useSession()
  const teams = useQuery(workTeamsQuery(tenantId))
  const members = useQuery({
    queryKey: ['work-member-options', tenantId],
    queryFn: () => loadWorkMemberOptions(tenantId),
  })
  const [responsibleId, setResponsibleId] = useState(order.responsible_user_id ?? '')
  const [workTeamId, setWorkTeamId] = useState(order.work_team_id ?? '')
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
        workTeamId: workTeamId || null,
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
      <CardContent>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          {members.isError ? (
            <p role="alert" className="text-destructive sm:col-span-2">
              No se pudo cargar el equipo: {members.error.message}
            </p>
          ) : null}
          {teams.isError ? (
            <div role="alert" className="text-destructive space-y-2 text-sm sm:col-span-2">
              <p>{teams.error.message}</p>
              <Button variant="outline" onPress={() => void teams.refetch()}>
                Reintentar equipos
              </Button>
            </div>
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
          <div className="space-y-2">
            <SelectField
              label="Equipo de trabajo"
              value={workTeamId}
              options={[
                { value: '', label: 'Sin equipo · solo responsable' },
                ...assignableWorkTeams(teams.data ?? [], order.work_team_id).map((team) => ({
                  value: team.id,
                  label: workTeamLabel(team),
                })),
              ]}
              onChange={(value) => {
                setWorkTeamId(value)
                changed()
              }}
            />
            <p className="text-muted-foreground text-xs">
              El responsable coordina el trabajo. Asignar un equipo no crea visitas ni cambia
              permisos.
            </p>
            {can(session?.role, 'team:manage') ? (
              <Link
                to="/ajustes"
                search={{ tab: 'equipo' }}
                className="text-primary text-xs underline"
              >
                Gestionar equipos
              </Link>
            ) : null}
          </div>
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
            <Button
              isDisabled={
                saving || members.isPending || members.isError || teams.isPending || teams.isError
              }
              onPress={() => void save()}
            >
              {saving ? 'Guardando…' : 'Guardar planificación'}
            </Button>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  )
}
