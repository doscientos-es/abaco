import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  toast,
} from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { workTeamLabel, workTeamsQuery } from '@/features/work-teams'
import { estimateTotals } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import { useTenantData } from '@/shared/store/store'
import { PageNotFound } from '@/shared/ui/page-states'

import {
  loadWorkMemberOptions,
  loadWorkOrder,
  transitionWorkOrder,
  type WorkOrderStatus,
} from '../application/work-order-actions'
import { WorkCostsPanel } from './work-costs-panel'
import { WorkExtrasPanel } from './work-extras-panel'
import { WorkPlanForm } from './work-plan-form'
import { WorkProfitabilityPanel } from './work-profitability-panel'
import { WorkStatusBadge, workStatusLabels } from './work-status-badge'
import { WorkStructurePanel } from './work-structure-panel'

const structureEventLabels = {
  phase_added: 'Fase añadida',
  task_added: 'Tarea añadida',
  task_status_changed: 'Estado de tarea actualizado',
  checklist_item_added: 'Comprobación añadida',
  checklist_item_changed: 'Comprobación actualizada',
}

const nextActions: Partial<
  Record<WorkOrderStatus, Array<{ status: WorkOrderStatus; label: string }>>
> = {
  ready: [
    { status: 'scheduled', label: 'Marcar como planificado' },
    { status: 'in_progress', label: 'Iniciar trabajo' },
    { status: 'canceled', label: 'Cancelar trabajo' },
  ],
  scheduled: [
    { status: 'in_progress', label: 'Iniciar trabajo' },
    { status: 'canceled', label: 'Cancelar trabajo' },
  ],
  in_progress: [
    { status: 'completed', label: 'Completar trabajo' },
    { status: 'canceled', label: 'Cancelar trabajo' },
  ],
}

export function WorkOrderDetailPage({ workOrderId }: { workOrderId: string }) {
  const { tenant } = useTenantData()
  const session = useSession()
  const queryClient = useQueryClient()
  const teams = useQuery(workTeamsQuery(tenant.id))
  const queryKey = ['work-order', tenant.id, workOrderId]
  const work = useQuery({ queryKey, queryFn: () => loadWorkOrder(tenant.id, workOrderId) })
  const members = useQuery({
    queryKey: ['work-member-options', tenant.id],
    queryFn: () => loadWorkMemberOptions(tenant.id),
  })
  const [changing, setChanging] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [planOpened, setPlanOpened] = useState(false)
  const [planVisible, setPlanVisible] = useState(false)
  const pendingOperation = useRef<{ status: WorkOrderStatus; id: string } | null>(null)

  async function changeStatus(status: WorkOrderStatus) {
    if (!work.data || changing) return
    const operation =
      pendingOperation.current?.status === status
        ? pendingOperation.current
        : { status, id: crypto.randomUUID() }
    pendingOperation.current = operation
    setChanging(true)
    try {
      await transitionWorkOrder(tenant.id, work.data, status, operation.id)
      setCancelOpen(false)
      pendingOperation.current = null
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['work-orders', tenant.id] })
      toast.success('Estado del trabajo actualizado')
    } catch (error) {
      toast.error('No se pudo cambiar el estado', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await queryClient.invalidateQueries({ queryKey })
    } finally {
      setChanging(false)
    }
  }

  if (work.isPending) return <output>Cargando trabajo…</output>
  if (work.isError) {
    return (
      <PageNotFound
        title="No se pudo cargar el trabajo"
        description={work.error.message}
        backTo="/trabajos"
        backLabel="Volver a trabajos"
      />
    )
  }

  const order = work.data
  const assignedTeam = teams.data?.find((team) => team.id === order.work_team_id)
  const totals = order.scope ? estimateTotals(order.scope) : null
  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>{order.title}</PageHeaderTitle>
          <PageHeaderDescription>{order.customerName}</PageHeaderDescription>
        </PageHeaderHeading>
        <PageHeaderActions>
          <WorkStatusBadge status={order.status} />
          <Link to="/trabajos" className="text-primary text-sm font-medium underline">
            Volver a trabajos
          </Link>
        </PageHeaderActions>
      </PageHeader>

      <AlertDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          if (!changing) setCancelOpen(open)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar este trabajo?</AlertDialogTitle>
            <AlertDialogDescription>
              «{order.title}» pasará a Cancelado. Su historial se conserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" isDisabled={changing} onPress={() => setCancelOpen(false)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              isDisabled={changing}
              onPress={() => void changeStatus('canceled')}
            >
              {changing ? 'Cancelando…' : 'Cancelar trabajo'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {order.publicationSource === 'migration' || order.acceptance?.mode === 'legacy_unverified' ? (
        <p className="border-warning/40 bg-warning/5 rounded-lg border p-3 text-sm">
          Este trabajo procede de datos anteriores a la conservación de versiones o evidencia de
          aceptación. Revisa el documento original antes de ejecutar.
        </p>
      ) : null}

      {order.scope && order.acceptance && totals ? (
        <Card>
          <CardHeader>
            <CardTitle>Origen y alcance aceptado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap justify-between gap-3">
              <p>
                Presupuesto{' '}
                {order.origin_estimate_id ? (
                  <Link
                    to="/presupuestos/$estimateId"
                    params={{ estimateId: order.origin_estimate_id }}
                    className="text-primary underline"
                  >
                    {order.scope.number}
                  </Link>
                ) : (
                  order.scope.number
                )}
              </p>
              <p className="font-semibold">Total acordado: {formatEuros(totals.totalCents)}</p>
            </div>
            <p className="text-muted-foreground">
              {order.acceptance.mode === 'office_manual'
                ? `Aceptación registrada por oficina a nombre de ${order.acceptance.responded_by ?? 'cliente no identificado'}`
                : order.acceptance.responded_by
                  ? `Aceptado por ${order.acceptance.responded_by}`
                  : 'Aceptación histórica sin identidad verificable'}
              {order.acceptance.responded_at
                ? ` · ${new Date(order.acceptance.responded_at).toLocaleString('es-ES')}`
                : ''}
            </p>
            {order.acceptance.mode === 'office_manual' ? (
              <p className="border-warning/40 bg-warning/5 rounded-lg border p-3 text-sm">
                La aceptación se registró manualmente; Ábaco no capturó una firma del cliente.
                {order.acceptance.evidence_description
                  ? ` Evidencia indicada: ${order.acceptance.evidence_description}`
                  : ''}
              </p>
            ) : null}
            <ul className="border-border divide-y border-y">
              {order.scope.lines.map((line) => (
                <li key={line.id} className="flex justify-between gap-3 py-2">
                  <span>{line.description}</span>
                  <span className="tabular-nums">
                    {line.quantity} {line.unit}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {order.originKind === 'incident'
                ? 'Trabajo creado desde una incidencia'
                : 'Trabajo creado manualmente'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Cliente: {order.customerName}</p>
            {order.locationName ? <p>Ubicación: {order.locationName}</p> : null}
            {order.description ? <p className="whitespace-pre-line">{order.description}</p> : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Equipo, responsable y fechas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Equipo:{' '}
            {order.work_team_id
              ? teams.isPending
                ? 'Cargando…'
                : teams.isError
                  ? 'No se pudo cargar el equipo'
                  : assignedTeam
                    ? workTeamLabel(assignedTeam)
                    : 'Equipo no disponible'
              : 'Sin equipo asignado'}
          </p>
          <p>
            Responsable:{' '}
            {order.responsible_user_id
              ? (members.data?.find((member) => member.id === order.responsible_user_id)?.label ??
                'Miembro del equipo')
              : 'Sin asignar'}
          </p>
          <p>
            Previsto:{' '}
            {order.planned_start_at
              ? new Date(order.planned_start_at).toLocaleString('es-ES')
              : 'Sin fecha'}
            {order.planned_end_at
              ? ` → ${new Date(order.planned_end_at).toLocaleString('es-ES')}`
              : ''}
          </p>
          {order.actual_start_at ? (
            <p>
              Iniciado: {new Date(order.actual_start_at).toLocaleString('es-ES')}
              {order.actual_end_at
                ? ` · Finalizado: ${new Date(order.actual_end_at).toLocaleString('es-ES')}`
                : ''}
            </p>
          ) : null}
          {order.description ? <p className="whitespace-pre-line">{order.description}</p> : null}
        </CardContent>
      </Card>

      {can(session?.role, 'work:write') && nextActions[order.status]?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Estado</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {nextActions[order.status]
              ?.filter((action) => action.status !== 'scheduled' || order.planned_start_at)
              .map((action) => (
                <Button
                  key={action.status}
                  variant={action.status === 'canceled' ? 'outline' : 'default'}
                  isDisabled={changing}
                  onPress={() =>
                    action.status === 'canceled'
                      ? setCancelOpen(true)
                      : void changeStatus(action.status)
                  }
                >
                  {action.label}
                </Button>
              ))}
          </CardContent>
        </Card>
      ) : null}

      {can(session?.role, 'work:write') &&
      order.status !== 'completed' &&
      order.status !== 'canceled' ? (
        <div className="space-y-4">
          <Button
            variant="outline"
            onPress={() => {
              setPlanOpened(true)
              setPlanVisible((visible) => !visible)
            }}
          >
            {planVisible ? 'Ocultar planificación' : 'Editar planificación'}
          </Button>
          {planOpened ? (
            <div hidden={!planVisible}>
              <WorkPlanForm
                key={order.updated_at}
                tenantId={tenant.id}
                order={order}
                onSaved={async () => {
                  await queryClient.invalidateQueries({ queryKey })
                  await queryClient.invalidateQueries({ queryKey: ['work-orders', tenant.id] })
                  setPlanVisible(false)
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <WorkStructurePanel
        tenantId={tenant.id}
        workOrderId={order.id}
        canWrite={
          can(session?.role, 'work:write') &&
          order.status !== 'completed' &&
          order.status !== 'canceled'
        }
        onChanged={async () => {
          await queryClient.invalidateQueries({ queryKey })
          await queryClient.invalidateQueries({ queryKey: ['work-orders', tenant.id] })
        }}
      />

      {can(session?.role, 'work:costs') ? (
        <WorkProfitabilityPanel
          tenantId={tenant.id}
          workOrderId={order.id}
          acceptedNetCents={totals?.subtotalCents ?? null}
        />
      ) : null}

      {can(session?.role, 'work:costs') ? (
        <WorkCostsPanel tenantId={tenant.id} workOrderId={order.id} />
      ) : null}

      {can(session?.role, 'work:costs') ? (
        <WorkExtrasPanel
          tenantId={tenant.id}
          workOrderId={order.id}
          canPropose={order.status !== 'completed' && order.status !== 'canceled'}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {order.events.map((event) => (
              <li key={event.id}>
                <time dateTime={event.occurred_at} className="text-muted-foreground">
                  {new Date(event.occurred_at).toLocaleString('es-ES')}
                </time>{' '}
                ·{' '}
                {event.kind === 'created'
                  ? order.origin_estimate_id
                    ? 'Trabajo creado desde presupuesto aceptado'
                    : order.originKind === 'incident'
                      ? 'Trabajo creado desde incidencia'
                      : 'Trabajo creado manualmente'
                  : event.kind === 'plan_changed'
                    ? 'Planificación actualizada'
                    : event.kind === 'status_changed'
                      ? `${workStatusLabels[event.payload.from ?? 'ready']} → ${workStatusLabels[event.payload.to ?? 'ready']}`
                      : structureEventLabels[event.kind]}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
