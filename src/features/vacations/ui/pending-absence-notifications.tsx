import { IconButton, Popover } from '@doscientos/ui'
import { Bell } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { listVacationRequests } from '../application/vacation-actions'

export function PendingAbsenceNotifications({ tenantId }: { tenantId: string }) {
  const requests = useQuery({
    queryKey: ['vacation-requests', tenantId],
    queryFn: () => listVacationRequests(tenantId),
    refetchInterval: 60_000,
  })
  const pending = requests.data?.filter((request) => request.status === 'pending').length ?? 0
  const showCount = !requests.isError && pending > 0

  return (
    <Popover
      placement="top end"
      className="w-[min(20rem,calc(100vw-2rem))] p-4"
      trigger={
        <IconButton
          label={showCount ? `Notificaciones: ${pending} solicitudes pendientes` : 'Notificaciones'}
          variant="ghost"
          className="text-muted-foreground relative"
        >
          <Bell aria-hidden="true" className="size-4" />
          {showCount ? (
            <span
              aria-hidden="true"
              className="bg-destructive absolute top-1 right-1 size-2 rounded-full"
            />
          ) : null}
        </IconButton>
      }
    >
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Notificaciones</h2>
        {requests.isPending ? (
          <p className="text-muted-foreground text-sm">Cargando solicitudes…</p>
        ) : requests.isError ? (
          <p role="alert" className="text-destructive text-sm">
            No se pudieron cargar las solicitudes de ausencia.
          </p>
        ) : pending > 0 ? (
          <p className="text-sm">
            {pending}{' '}
            {pending === 1
              ? 'solicitud de ausencia pendiente'
              : 'solicitudes de ausencia pendientes'}
            .
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            No hay solicitudes de ausencia pendientes.
          </p>
        )}
        <Link to="/vacaciones" className="text-primary text-sm font-medium hover:underline">
          Gestionar ausencias
        </Link>
      </div>
    </Popover>
  )
}
