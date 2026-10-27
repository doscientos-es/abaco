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
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'
import { useTenantData } from '@/shared/store/store'

import { listWorkOrders, type WorkOrderStatus } from '../application/work-order-actions'
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
  const [page, setPage] = useState(0)
  const [showManualForm, setShowManualForm] = useState(false)
  const orders = useQuery({
    queryKey: ['work-orders', tenant.id, page],
    queryFn: () => listWorkOrders(tenant.id, page),
  })

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Trabajos</PageHeaderTitle>
          <PageHeaderDescription>
            Operaciones creadas manualmente o desde presupuestos aceptados. La planificación,
            ejecución y los partes se incorporan progresivamente.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      {can(session?.role, 'work:write') ? (
        <Button variant="outline" onPress={() => setShowManualForm((value) => !value)}>
          {showManualForm ? 'Cerrar formulario' : 'Nuevo trabajo'}
        </Button>
      ) : null}
      {showManualForm ? <ManualWorkForm tenantId={tenant.id} clients={clients} /> : null}
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
            <p className="font-medium">Aún no hay trabajos en esta página.</p>
            <p className="text-muted-foreground">
              Crea uno manualmente o abre un presupuesto aceptado y elige «Crear trabajo».
            </p>
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
                    {clients.find((client) => client.id === order.client_id)?.name ?? 'Cliente'} ·{' '}
                    {workStatusLabels[order.status]}
                  </p>
                  <time className="text-muted-foreground text-xs" dateTime={order.created_at}>
                    Creado el {new Date(order.created_at).toLocaleDateString('es-ES')}
                  </time>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
      {orders.data && orders.data.count > orders.data.pageSize ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Página {page + 1} de {Math.ceil(orders.data.count / orders.data.pageSize)}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" isDisabled={page === 0} onPress={() => setPage(page - 1)}>
              Anterior
            </Button>
            <Button
              variant="outline"
              isDisabled={(page + 1) * orders.data.pageSize >= orders.data.count}
              onPress={() => setPage(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
