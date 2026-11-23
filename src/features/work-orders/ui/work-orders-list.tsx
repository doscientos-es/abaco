import { CalendarBlankIcon, CaretRightIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import type { WorkOrder } from '../application/work-order-actions'
import { WorkStatusBadge } from './work-status-badge'

const dateFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function WorkOrdersList({
  orders,
  clients,
  teams,
  teamsLoading,
  teamsError,
}: {
  orders: WorkOrder[]
  clients: ReadonlyMap<string, string>
  teams: ReadonlyMap<string, string>
  teamsLoading: boolean
  teamsError: boolean
}) {
  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border">
      <div
        aria-hidden="true"
        className="bg-muted/40 text-muted-foreground hidden gap-4 border-b px-5 py-3 text-xs font-medium lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_1rem]"
      >
        <span>Trabajo / cliente</span>
        <span>Estado</span>
        <span>Equipo</span>
        <span>Inicio previsto</span>
        <span />
      </div>
      <ul aria-label="Trabajos" className="divide-border divide-y">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              to="/trabajos/$workOrderId"
              params={{ workOrderId: order.id }}
              className="hover:bg-muted/40 focus-visible:ring-primary grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_1rem] lg:gap-4 lg:py-4"
            >
              <div className="min-w-0">
                <p className="text-foreground text-sm font-semibold break-words">{order.title}</p>
                <p className="text-muted-foreground mt-1 text-xs break-words">
                  {clients.get(order.client_id) ?? 'Cliente no disponible'}
                </p>
              </div>
              <div>
                <WorkStatusBadge status={order.status} />
              </div>
              <div className="text-muted-foreground col-span-2 flex min-w-0 items-center gap-2 text-xs lg:col-span-1">
                <UsersThreeIcon aria-hidden="true" className="size-4 shrink-0" />
                <span className="break-words">
                  {order.work_team_id
                    ? (teams.get(order.work_team_id) ??
                      (teamsLoading
                        ? 'Cargando equipo…'
                        : teamsError
                          ? 'Error al cargar equipo'
                          : 'Equipo no disponible'))
                    : 'Sin equipo asignado'}
                </span>
              </div>
              <div className="text-muted-foreground col-span-2 flex min-w-0 items-center gap-2 text-xs lg:col-span-1">
                <CalendarBlankIcon aria-hidden="true" className="size-4 shrink-0" />
                <span className="flex flex-wrap gap-x-2 gap-y-1 lg:block lg:space-y-1">
                  {order.planned_start_at ? (
                    <time dateTime={order.planned_start_at} className="block">
                      {dateFormat.format(new Date(order.planned_start_at))}
                    </time>
                  ) : (
                    <span className="block">Sin fecha de inicio</span>
                  )}
                  {order.planned_end_at ? (
                    <span className="block">
                      Hasta{' '}
                      <time dateTime={order.planned_end_at}>
                        {dateFormat.format(new Date(order.planned_end_at))}
                      </time>
                    </span>
                  ) : null}
                </span>
              </div>
              <CaretRightIcon
                aria-hidden="true"
                className="text-muted-foreground hidden size-4 lg:block"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
