import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, toast } from '@doscientos/ui'
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
  const [error, setError] = useState('')
  const operationId = useRef(crypto.randomUUID())
  const dirty = responsibleId !== (order.responsible_user_id ?? '') ||
    workTeamId !== (order.work_team_id ?? '') ||
    startAt !== toLocalInput(order.planned_start_at) ||
    endAt !== toLocalInput(order.planned_end_at) || description !== order.description
  const dateError = startAt && endAt && endAt < startAt
    ? 'El fin previsto no puede ser anterior al inicio.' : ''
  const optionsReady = members.isSuccess && teams.isSuccess

  function reset() {
    setResponsibleId(order.responsible_user_id ?? '')
    setWorkTeamId(order.work_team_id ?? '')
    setStartAt(toLocalInput(order.planned_start_at))
    setEndAt(toLocalInput(order.planned_end_at))
    setDescription(order.description)
    setError('')
    changed()
  }

  function changed() {
    operationId.current = crypto.randomUUID()
  }

  async function save() {
    if (saving || !dirty || !optionsReady || dateError) return
    setSaving(true)
    setError('')
    try {
      const plannedStartAt = toUtc(startAt)
      const plannedEndAt = toUtc(endAt)
      if (plannedStartAt && plannedEndAt && plannedEndAt < plannedStartAt)
        throw new Error('El fin previsto no puede ser anterior al inicio.')
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planificación</CardTitle>
        <CardDescription>Asigna quién coordina el trabajo y cuándo está previsto. Las fechas no crean visitas automáticamente.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => { event.preventDefault(); void save() }} aria-busy={saving}>
          <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
            {!optionsReady && !members.isError && !teams.isError ? <output className="text-muted-foreground text-sm sm:col-span-2">Cargando personas y equipos…</output> : null}
            {members.isError ? (
              <div role="alert" className="space-y-2 text-sm sm:col-span-2">
                <p className="text-destructive">No se pudieron cargar las personas: {members.error.message}</p>
                <Button variant="outline" onPress={() => void members.refetch()}>Reintentar personas</Button>
              </div>
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
              isDisabled={saving || !members.isSuccess}
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
                isDisabled={saving || !teams.isSuccess}
                value={workTeamId}
                options={[
                  { value: '', label: 'Sin equipo asignado' },
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
              min={startAt || undefined}
              onChange={(value) => {
                setEndAt(value)
                changed()
              }}
              placeholder="Fin previsto"
            />
            {dateError ? <p role="alert" className="text-destructive text-sm sm:col-span-2">{dateError}</p> : null}
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
            {error ? <p role="alert" className="text-destructive text-sm sm:col-span-2">No se pudo guardar la planificación: {error}</p> : null}
            <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4 sm:col-span-2">
              <output aria-live="polite" className="text-muted-foreground text-xs">{dirty ? 'Tienes cambios sin guardar' : 'Sin cambios pendientes'}</output>
              <div className="flex flex-wrap gap-2">
                {dirty ? <Button variant="outline" isDisabled={saving} onPress={reset}>Restablecer</Button> : null}
                <Button
                  type="submit"
                  isDisabled={
                    saving || !dirty || !optionsReady || Boolean(dateError)
                  }
                >
                  {saving ? 'Guardando…' : 'Guardar planificación'}
                </Button>
              </div>
            </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  )
}
