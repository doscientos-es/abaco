import { Button, Textarea, toast } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { useSession } from '@/features/auth'

import { decideVacationRequest, listVacationRequests } from '../application/vacation-actions'
import {
  vacationRequestStatuses,
  vacationRequestStatusLabels,
  type VacationRequestStatus,
} from '../domain/vacation-request'
import { VacationRequestCard } from './vacation-request-card'
import { VacationCoverage } from './vacation-coverage'

type StatusFilter = 'all' | VacationRequestStatus

const requestQueryKey = (tenantId: string | null | undefined) => ['vacation-requests', tenantId]

export function VacationManagementPage() {
  const session = useSession()
  const tenantId = session?.tenantId
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const requests = useQuery({
    queryKey: requestQueryKey(tenantId),
    enabled: Boolean(tenantId),
    queryFn: () => {
      if (!tenantId) throw new Error('Selecciona una empresa.')
      return listVacationRequests(tenantId)
    },
  })
  const decide = useMutation({
    mutationFn: (input: {
      requestId: string
      decision: Extract<VacationRequestStatus, 'approved' | 'rejected'>
      comment: string
    }) => {
      if (!tenantId) throw new Error('Selecciona una empresa.')
      return decideVacationRequest({ tenantId, ...input })
    },
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: requestQueryKey(tenantId) })
      if (input.decision === 'approved' && tenantId) {
        setFilter('approved')
        await queryClient.invalidateQueries({ queryKey: ['vacation-coverage', tenantId] })
      }
      toast.success(
        input.decision === 'approved'
          ? 'Vacaciones aprobadas · revisa los servicios afectados'
          : 'Solicitud rechazada',
      )
    },
    onError: (error: Error) =>
      toast.error('No se pudo guardar la decisión', { description: error.message }),
  })

  const visibleRequests = (requests.data ?? []).filter(
    (request) => filter === 'all' || request.status === filter,
  )
  const countFor = (status: StatusFilter) =>
    status === 'all'
      ? (requests.data?.length ?? 0)
      : (requests.data?.filter((request) => request.status === status).length ?? 0)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Solicitudes de vacaciones</h1>
        <p className="text-muted-foreground text-sm">
          Revisa cada solicitud y deja constancia de la decisión. Las vacaciones aprobadas
          bloquearán nuevas visitas en esas fechas; revisa los servicios afectados para organizar
          su cobertura.
        </p>
      </header>

      <nav aria-label="Filtrar solicitudes" className="flex flex-wrap gap-2">
        {(['all', ...vacationRequestStatuses] as const).map((status) => (
          <Button
            key={status}
            type="button"
            size="sm"
            variant={filter === status ? 'default' : 'outline'}
            aria-pressed={filter === status}
            onPress={() => setFilter(status)}
          >
            {status === 'all' ? 'Todas' : vacationRequestStatusLabels[status]} ({countFor(status)})
          </Button>
        ))}
      </nav>

      {requests.isPending ? <output>Cargando solicitudes…</output> : null}
      {requests.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {requests.error.message}
        </p>
      ) : null}
      {!requests.isPending && !requests.isError && visibleRequests.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          No hay solicitudes en este estado.
        </p>
      ) : null}
      <div className="space-y-3">
        {visibleRequests.map((request) => (
          <VacationRequestCard key={request.id} request={request} showRequester>
            {request.status !== 'rejected' && tenantId ? (
              <VacationCoverage
                tenantId={tenantId}
                requestId={request.id}
                approved={request.status === 'approved'}
              />
            ) : null}
            {request.status === 'pending' ? (
              <DecisionForm
                disabled={decide.isPending}
                onDecide={(decision, comment) =>
                  decide.mutate({ requestId: request.id, decision, comment })
                }
              />
            ) : null}
          </VacationRequestCard>
        ))}
      </div>
    </div>
  )
}

function DecisionForm({
  disabled,
  onDecide,
}: {
  disabled: boolean
  onDecide: (decision: 'approved' | 'rejected', comment: string) => void
}) {
  const [comment, setComment] = useState('')
  const commentId = useId()
  return (
    <div className="border-border space-y-3 border-t pt-3">
      <label htmlFor={commentId} className="grid gap-1.5 text-sm font-medium">
        <span>Comentario de decisión (opcional)</span>
        <Textarea
          id={commentId}
          value={comment}
          maxLength={1000}
          rows={2}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={disabled} onPress={() => onDecide('approved', comment)}>
          Aprobar
        </Button>
        <Button
          variant="outline"
          isDisabled={disabled}
          onPress={() => onDecide('rejected', comment)}
        >
          Rechazar
        </Button>
      </div>
    </div>
  )
}
