import { Button, Textarea, toast } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { useSession } from '@/features/auth'

import {
  decideVacationRequest,
  listVacationRequests,
  requestAbsenceInformation,
} from '../application/vacation-actions'
import {
  absenceTypeLabels,
  absenceTypes,
  vacationRequestStatuses,
  vacationRequestStatusLabels,
  type VacationRequestStatus,
} from '../domain/vacation-request'
import { VacationCoverage } from './vacation-coverage'
import { VacationRequestCard } from './vacation-request-card'

type StatusFilter = 'all' | VacationRequestStatus

const requestQueryKey = (tenantId: string | null | undefined) => ['vacation-requests', tenantId]

export function VacationManagementPage() {
  const session = useSession()
  const tenantId = session?.tenantId
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const [typeFilter, setTypeFilter] = useState<'all' | (typeof absenceTypes)[number]>('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
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
          ? 'Ausencia aprobada · revisa los servicios afectados'
          : 'Solicitud rechazada',
      )
    },
    onError: (error: Error) =>
      toast.error('No se pudo guardar la decisión', { description: error.message }),
  })
  const requestInfo = useMutation({
    mutationFn: (input: { requestId: string; comment: string }) => {
      if (!tenantId) throw new Error('Selecciona una empresa.')
      return requestAbsenceInformation({ tenantId, ...input })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: requestQueryKey(tenantId) })
      await queryClient.invalidateQueries({
        queryKey: ['vacation-decision-notifications', tenantId],
      })
      toast.success('Solicitud enviada al trabajador para completar')
    },
    onError: (error: Error) =>
      toast.error('No se pudo solicitar la información', { description: error.message }),
  })

  const visibleRequests = (requests.data ?? []).filter(
    (request) =>
      (filter === 'all' || request.status === filter) &&
      (typeFilter === 'all' || request.absenceType === typeFilter) &&
      request.requesterName
        .toLocaleLowerCase('es')
        .includes(search.trim().toLocaleLowerCase('es')) &&
      (!dateFrom || (request.endDate ?? '9999-12-31') >= dateFrom) &&
      (!dateTo || request.startDate <= dateTo),
  )
  const countFor = (status: StatusFilter) =>
    status === 'all'
      ? (requests.data?.length ?? 0)
      : (requests.data?.filter((request) => request.status === status).length ?? 0)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Solicitudes de ausencia</h1>
        <p className="text-muted-foreground text-sm">
          Revisa cada solicitud y deja constancia de la decisión. Las vacaciones y bajas aprobadas
          bloquearán nuevas visitas en esas fechas; revisa los servicios afectados para organizar su
          cobertura.
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1.5 text-sm font-medium">
          Buscar trabajador
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre del trabajador"
            className="border-input bg-background min-h-10 rounded-md border px-3"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Tipo de ausencia
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
            className="border-input bg-background min-h-10 rounded-md border px-3"
          >
            <option value="all">Todos los tipos</option>
            {absenceTypes.map((type) => (
              <option key={type} value={type}>
                {absenceTypeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Desde
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="border-input bg-background min-h-10 rounded-md border px-3"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Hasta
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="border-input bg-background min-h-10 rounded-md border px-3"
          />
        </label>
      </div>

      {requests.isPending ? <output>Cargando solicitudes…</output> : null}
      {requests.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {requests.error.message}
        </p>
      ) : null}
      {!requests.isPending && !requests.isError && visibleRequests.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          No hay solicitudes que coincidan con estos filtros.
        </p>
      ) : null}
      <div className="space-y-3">
        {visibleRequests.map((request) => (
          <VacationRequestCard key={request.id} request={request} showRequester>
            {request.status !== 'rejected' &&
            (request.absenceType === 'vacation' || request.absenceType === 'sick_leave') &&
            tenantId ? (
              <VacationCoverage
                tenantId={tenantId}
                requestId={request.id}
                approved={request.status === 'approved'}
              />
            ) : null}
            {request.status === 'pending' || request.status === 'needs_info' ? (
              <DecisionForm
                awaitingWorkerInformation={request.status === 'needs_info'}
                disabled={decide.isPending || requestInfo.isPending}
                onDecide={(decision, comment) =>
                  decide.mutate({ requestId: request.id, decision, comment })
                }
                onRequestInfo={(comment) => requestInfo.mutate({ requestId: request.id, comment })}
              />
            ) : null}
          </VacationRequestCard>
        ))}
      </div>
    </div>
  )
}

function DecisionForm({
  awaitingWorkerInformation,
  disabled,
  onDecide,
  onRequestInfo,
}: {
  awaitingWorkerInformation: boolean
  disabled: boolean
  onDecide: (decision: 'approved' | 'rejected', comment: string) => void
  onRequestInfo: (comment: string) => void
}) {
  const [comment, setComment] = useState('')
  const commentId = useId()
  return (
    <div className="border-border space-y-3 border-t pt-3">
      <label htmlFor={commentId} className="grid gap-1.5 text-sm font-medium">
        <span>
          {awaitingWorkerInformation
            ? 'Información adicional que falta'
            : 'Comentario o información que falta'}
        </span>
        <Textarea
          id={commentId}
          value={comment}
          maxLength={1000}
          rows={2}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      {awaitingWorkerInformation ? (
        <p className="text-muted-foreground text-sm">
          La solicitud está esperando respuesta del trabajador. Podrás aprobarla o rechazarla cuando
          responda.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!awaitingWorkerInformation ? (
          <>
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
          </>
        ) : null}
        <Button
          variant="outline"
          isDisabled={disabled || !comment.trim()}
          onPress={() => onRequestInfo(comment)}
        >
          Solicitar información
        </Button>
      </div>
    </div>
  )
}
