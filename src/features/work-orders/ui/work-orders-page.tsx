import {
  Button,
  Card,
  CardContent,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'
import { workTeamLabel, workTeamsQuery } from '@/features/work-teams'
import { useTenantData } from '@/shared/store/store'
import { SelectField } from '@/shared/ui/form'

import { listWorkOrders, type WorkOrderStatus } from '../application/work-order-actions'
import type { WorkSearch } from '../domain/work-search'
import { ManualWorkForm } from './manual-work-form'

export const workStatusLabels: Record<WorkOrderStatus, string> = {
  ready: 'Pendiente de preparar',
  scheduled: 'Programado',
  in_progress: 'En curso',
  completed: 'Completado',
  canceled: 'Cancelado',
}

export function WorkOrdersPage() {
  const { tenant, clients } = useTenantData()
  const session = useSession()
  const search = useSearch({ from: '/trabajos' })
  const navigate = useNavigate()
  const page = search.pagina ?? 0
  const [showManualForm, setShowManualForm] = useState(false)
  const teams = useQuery(workTeamsQuery(tenant.id))
  const orders = useQuery({
    queryKey: ['work-orders', tenant.id, search],
    queryFn: () => listWorkOrders(tenant.id, page, 20, search),
  })
  const teamLabelById = new Map((teams.data ?? []).map((team) => [team.id, workTeamLabel(team)]))
  const clientById = new Map(clients.map((client) => [client.id, client.name]))
  const filtered = Boolean(search.equipo || search.estado)
  const setSearch = (next: WorkSearch) => void navigate({ to: '/trabajos', search: next })

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Trabajos</PageHeaderTitle>
          <PageHeaderDescription>
            Organiza los trabajos de tus clientes, asigna equipos y sigue su ejecución.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      {can(session?.role, 'work:write') ? (
        <Button variant="outline" onPress={() => setShowManualForm((value) => !value)}>
          {showManualForm ? 'Cerrar formulario' : 'Nuevo trabajo'}
        </Button>
      ) : null}
      {showManualForm ? <ManualWorkForm tenantId={tenant.id} clients={clients} /> : null}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Equipo de trabajo"
              value={search.equipo ?? ''}
              options={[
                { value: '', label: 'Todos los equipos' },
                { value: 'unassigned', label: 'Sin equipo asignado' },
                ...(teams.data ?? []).map((team) => ({
                  value: team.id,
                  label: workTeamLabel(team),
                })),
              ]}
              onChange={(value) =>
                setSearch({ ...search, equipo: value || undefined, pagina: undefined })
              }
            />
            <SelectField
              label="Estado"
              value={search.estado ?? ''}
              options={[
                { value: '', label: 'Todos los estados' },
                ...Object.entries(workStatusLabels).map(([value, label]) => ({ value, label })),
              ]}
              onChange={(value) =>
                setSearch({
                  ...search,
                  estado: (value || undefined) as WorkSearch['estado'],
                  pagina: undefined,
                })
              }
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <output aria-live="polite" className="text-muted-foreground">
              {orders.data
                ? `${orders.data.count} trabajos${filtered ? ' con estos filtros' : ''}`
                : 'Cargando trabajos…'}
            </output>
            {filtered ? (
              <Button variant="ghost" onPress={() => setSearch({})}>
                Limpiar filtros
              </Button>
            ) : null}
            {can(session?.role, 'team:manage') ? (
              <Link to="/ajustes" search={{ tab: 'equipo' }} className="text-primary underline">
                Gestionar equipos
              </Link>
            ) : null}
          </div>
          {teams.isError ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
              <p className="text-destructive">{teams.error.message}</p>
              <Button variant="outline" onPress={() => void teams.refetch()}>
                Reintentar equipos
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {orders.isPending ? <output>Cargando trabajos…</output> : null}
      {orders.isError ? (
        <div role="alert" className="border-destructive rounded-lg border p-4 text-sm">
          No se pudieron cargar los trabajos: {orders.error.message}
          <Button variant="outline" className="ml-3" onPress={() => void orders.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {orders.data?.items.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-6 text-sm">
            <p className="font-medium">
              {filtered
                ? 'No hay trabajos con estos filtros.'
                : page > 0
                  ? 'No hay trabajos en esta página.'
                  : 'Aún no hay trabajos.'}
            </p>
            <p className="text-muted-foreground">
              {filtered
                ? 'Prueba otro equipo o estado para encontrar lo que buscas.'
                : 'Crea uno manualmente o abre un presupuesto aceptado y elige «Crear trabajo».'}
            </p>
            {page > 0 ? (
              <Button variant="outline" onPress={() => setSearch({ ...search, pagina: undefined })}>
                Volver a la primera página
              </Button>
            ) : null}
            <Link to="/presupuestos" className="text-primary underline">
              Ver presupuestos
            </Link>
          </CardContent>
        </Card>
      ) : null}
      {orders.data?.items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {orders.data.items.map((order) => (
            <li key={order.id}>
              <Card className="h-full">
                <CardContent className="space-y-2 p-4">
                  <Link
                    to="/trabajos/$workOrderId"
                    params={{ workOrderId: order.id }}
                    className="text-primary font-semibold underline-offset-4 hover:underline"
                  >
                    {order.title}
                  </Link>
                  <p className="text-muted-foreground text-sm">
                    {clientById.get(order.client_id) ?? 'Cliente'} ·{' '}
                    {workStatusLabels[order.status]}
                  </p>
                  <p className="text-sm">
                    {order.work_team_id
                      ? (teamLabelById.get(order.work_team_id) ??
                        (teams.isPending ? 'Cargando equipo…' : 'Equipo no disponible'))
                      : 'Sin equipo asignado'}
                  </p>
                  {order.planned_start_at ? (
                    <p className="text-muted-foreground text-xs">
                      Previsto:{' '}
                      <time dateTime={order.planned_start_at}>
                        {new Date(order.planned_start_at).toLocaleDateString('es-ES')}
                      </time>
                      {order.planned_end_at
                        ? ` → ${new Date(order.planned_end_at).toLocaleDateString('es-ES')}`
                        : ''}
                    </p>
                  ) : null}
                  <time className="text-muted-foreground text-xs" dateTime={order.created_at}>
                    Creado el {new Date(order.created_at).toLocaleDateString('es-ES')}
                  </time>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
      {orders.data && (page > 0 || orders.data.count > orders.data.pageSize) ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Página {page + 1}
            {orders.data.count > 0
              ? ` de ${Math.max(page + 1, Math.ceil(orders.data.count / orders.data.pageSize))}`
              : ''}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              isDisabled={page === 0}
              onPress={() => setSearch({ ...search, pagina: page - 1 })}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              isDisabled={(page + 1) * orders.data.pageSize >= orders.data.count}
              onPress={() => setSearch({ ...search, pagina: page + 1 })}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
