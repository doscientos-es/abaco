import {
  Button,
  Popover,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@doscientos/ui'
import { CalendarBlank } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { useSession } from '@/features/auth'
import { FilterDisclosure } from '@/shared/ui/filter-disclosure'

import {
  decideVacationRequest,
  listVacationRequests,
  requestAbsenceInformation,
} from '../application/vacation-actions'
import { calendarDate } from '../domain/absence-calendar'
import type { AbsenceCalendarProposal } from '../domain/absence-events'
import {
  absenceTypeLabels,
  absenceTypes,
  vacationRequestStatuses,
  vacationRequestStatusLabels,
  type VacationRequestStatus,
  type VacationRequest,
} from '../domain/vacation-request'
import { AbsenceDateRangePicker } from './absence-date-range-picker'
import { AbsenceOverview } from './absence-overview'
import { AbsenceHistory, AdminAbsenceForm } from './admin-absence-form'
import { VacationCoverage } from './vacation-coverage'
import { VacationRequestCard } from './vacation-request-card'

type StatusFilter = 'all' | VacationRequestStatus

const requestQueryKey = (tenantId: string | null | undefined) => ['vacation-requests', tenantId]
const filterDateFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function VacationManagementPage() {
  const session = useSession()
  const tenantId = session?.tenantId
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const [typeFilter, setTypeFilter] = useState<'all' | (typeof absenceTypes)[number]>('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editing, setEditing] = useState<VacationRequest | null | undefined>(undefined)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [calendarProposal, setCalendarProposal] = useState<AbsenceCalendarProposal | undefined>(
    undefined,
  )
  const [tab, setTab] = useState<'calendar' | 'pending'>('calendar')
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
  const fromLabel = dateFrom ? filterDateFormat.format(calendarDate(dateFrom)) : ''
  const toLabel = dateTo ? filterDateFormat.format(calendarDate(dateTo)) : ''
  const dateLabel =
    fromLabel && toLabel
      ? fromLabel === toLabel
        ? fromLabel
        : `${fromLabel} – ${toLabel}`
      : fromLabel
        ? `Desde ${fromLabel}`
        : toLabel
          ? `Hasta ${toLabel}`
          : 'Cualquier fecha'

  return (
    <div className="@container min-w-0 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Solicitudes de ausencia</h1>
        <Button
          onPress={() => {
            setCalendarProposal(undefined)
            setEditing(null)
          }}
        >
          Registrar ausencia
        </Button>
      </header>

      {requests.isPending ? <output>Cargando solicitudes…</output> : null}
      {requests.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {requests.error.message}
        </p>
      ) : null}
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as 'calendar' | 'pending')}>
        <TabsList aria-label="Secciones de ausencias" className="w-full sm:w-fit">
          <TabsTrigger id="calendar">Calendario</TabsTrigger>
          <TabsTrigger id="pending">Pendientes</TabsTrigger>
        </TabsList>
        <TabsContent id="calendar" shouldForceMount className="mt-4 data-[inert]:hidden">
          {requests.isSuccess ? (
            <AbsenceOverview
              requests={requests.data ?? []}
              onEdit={
                session?.role === 'admin'
                  ? (request, proposal) => {
                      setCalendarProposal(proposal)
                      setEditing(request)
                    }
                  : undefined
              }
              onRange={(from, through) => {
                setDateFrom(from)
                setDateTo(through)
                setFilter('all')
                setTypeFilter('all')
                setSearch('')
                setTab('pending')
              }}
            />
          ) : null}
        </TabsContent>
        <TabsContent id="pending" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="w-36 max-w-full">
              <span className="sr-only">Estado</span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as StatusFilter)}
                className="border-input bg-background h-9 w-full min-w-0 rounded-md border px-3"
              >
                {(['all', ...vacationRequestStatuses] as const).map((status) => (
                  <option key={status} value={status}>
                    {status === 'all' ? 'Todas' : vacationRequestStatusLabels[status]} (
                    {countFor(status)})
                  </option>
                ))}
              </select>
            </label>
            <label className="w-48 max-w-full">
              <span className="sr-only">Buscar trabajador</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nombre del trabajador"
                className="border-input bg-background h-9 w-full min-w-0 rounded-md border px-3"
              />
            </label>
            <FilterDisclosure
              activeCount={Number(typeFilter !== 'all') + Number(Boolean(dateFrom || dateTo))}
            >
              <label className="grid w-44 max-w-full gap-1.5 text-sm font-medium">
                Tipo de ausencia
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
                  className="border-input bg-background h-9 w-full min-w-0 rounded-md border px-3"
                >
                  <option value="all">Todos los tipos</option>
                  {absenceTypes.map((type) => (
                    <option key={type} value={type}>
                      {absenceTypeLabels[type]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid w-64 max-w-full min-w-0 gap-1.5">
                <span aria-hidden="true" className="text-sm font-medium">
                  Fechas
                </span>
                <Popover
                  placement="bottom end"
                  className="max-h-[80dvh] w-[min(38rem,calc(100vw-2rem))] overflow-y-auto p-2"
                  trigger={
                    <Button
                      variant="outline"
                      aria-label={`Filtrar por fechas. Desde ${fromLabel || 'sin límite'} hasta ${toLabel || 'sin límite'}`}
                      className="h-9 w-full min-w-0 justify-start gap-2 px-3 text-left font-normal"
                    >
                      <CalendarBlank
                        aria-hidden="true"
                        className="text-muted-foreground size-4 shrink-0"
                      />
                      <span
                        className={`truncate ${dateFrom || dateTo ? '' : 'text-muted-foreground'}`}
                      >
                        {dateLabel}
                      </span>
                    </Button>
                  }
                >
                  <AbsenceDateRangePicker
                    start={dateFrom}
                    end={dateTo}
                    endOptional={false}
                    mode="filter"
                    onChange={(start, end) => {
                      setDateFrom(start)
                      setDateTo(end)
                    }}
                  />
                </Popover>
              </div>
              {typeFilter !== 'all' || dateFrom || dateTo ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setTypeFilter('all')
                    setDateFrom('')
                    setDateTo('')
                  }}
                >
                  Limpiar filtros adicionales
                </Button>
              ) : null}
            </FilterDisclosure>
          </div>

          {!requests.isPending && !requests.isError && visibleRequests.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay solicitudes que coincidan con estos filtros.
            </p>
          ) : null}
          <div className="space-y-3">
            {visibleRequests.map((request) => (
              <VacationRequestCard key={request.id} request={request} showRequester>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onPress={() => {
                      setCalendarProposal(undefined)
                      setEditing(request)
                    }}
                  >
                    Editar / cancelar
                  </Button>
                  <Button
                    variant="ghost"
                    onPress={() => setHistoryId(historyId === request.id ? null : request.id)}
                  >
                    Historial
                  </Button>
                </div>
                {tenantId && historyId === request.id ? (
                  <AbsenceHistory tenantId={tenantId} requestId={request.id} />
                ) : null}
                {request.status !== 'rejected' &&
                request.status !== 'canceled' &&
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
                    onRequestInfo={(comment) =>
                      requestInfo.mutate({ requestId: request.id, comment })
                    }
                  />
                ) : null}
              </VacationRequestCard>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {tenantId && editing !== undefined ? (
        <AdminAbsenceForm
          key={`${editing?.id ?? 'new'}:${calendarProposal?.startDate}:${calendarProposal?.endDate}`}
          tenantId={tenantId}
          request={editing}
          requests={requests.data ?? []}
          proposal={calendarProposal}
          onDone={() => setEditing(undefined)}
        />
      ) : null}
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
