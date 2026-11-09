import { Button } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  listVacationDecisionNotifications,
  readVacationDecisionNotification,
} from '../application/vacation-actions'

export function VacationDecisionNotices({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient()
  const queryKey = ['vacation-decision-notifications', tenantId]
  const notices = useQuery({ queryKey, queryFn: () => listVacationDecisionNotifications(tenantId) })
  const read = useMutation({
    mutationFn: readVacationDecisionNotification,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  if (notices.isPending) return <p>Cargando avisos…</p>
  if (notices.isError) return <p role="alert">No se pudieron cargar los avisos de vacaciones.</p>
  if (!notices.data?.length) return null

  return (
    <section aria-labelledby="vacation-notices-title" className="space-y-3">
      <h2 id="vacation-notices-title" className="text-lg font-semibold">
        Avisos de vacaciones
      </h2>
      <ul className="space-y-2">
        {notices.data.map((notice) => (
          <li
            key={notice.id}
            className="border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <span>
              {notice.decision === 'approved'
                ? 'Tu solicitud ha sido aprobada.'
                : 'Tu solicitud ha sido rechazada.'}{' '}
              <a className="text-primary underline" href={`#vacation-request-${notice.requestId}`}>
                Ver solicitud
              </a>
              . {!notice.readAt ? 'Sin leer' : 'Leído'}
            </span>
            {!notice.readAt ? (
              <Button
                size="sm"
                variant="outline"
                isDisabled={read.isPending}
                onPress={() => read.mutate(notice.id)}
              >
                Marcar como leído
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {read.isError ? <p role="alert">No se pudo marcar el aviso como leído.</p> : null}
    </section>
  )
}
