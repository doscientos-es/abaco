import { Button } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'

import { moveDays, todayInMadrid } from '@/shared/lib/date-range'
import { FormDialog } from '@/shared/ui/form-dialog'

import { listMyVisits } from '../application/visit-actions'
import {
  createVisitSwapProposal,
  decideVisitSwapProposal,
  listVisitSwapOptions,
  listVisitSwapProposals,
  type VisitSwapDecision,
  type VisitSwapProposal,
} from '../application/visit-swap-actions'

const controls = 'border-border bg-background min-h-11 w-full rounded-md border px-2 text-sm'
const dateTime = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
})
const status = {
  pending: 'Pendiente de coordinación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  withdrawn: 'Retirado',
}
const decisionText = {
  approved: 'Aprobar intercambio',
  rejected: 'Rechazar propuesta',
  withdrawn: 'Retirar mi propuesta',
}
const proposalKey = (tenantId: string, userId: string) =>
  ['visit-swap-proposals', tenantId, userId] as const

function timeRange(start: string, end: string) {
  return dateTime.formatRange(new Date(start), new Date(end))
}

type Scope = { tenantId: string; userId: string }

function NewSwapForm({
  tenantId,
  userId,
  close,
  onConfirmed,
}: Scope & { close: () => void; onConfirmed: (state: VisitSwapProposal['state']) => void }) {
  const [openedAt] = useState(() => new Date())
  const today = todayInMadrid(openedAt)
  const until = moveDays(today, 14)
  const [ownId, setOwnId] = useState('')
  const [day, setDay] = useState('')
  const [otherId, setOtherId] = useState('')
  const operationIds = useRef(new Map<string, string>())
  const ownVisits = useQuery({
    queryKey: ['visit-swap-own-visits', tenantId, userId, today, until],
    queryFn: () => listMyVisits(tenantId, today, until),
    retry: false,
  })
  const eligible = (ownVisits.data ?? []).filter(
    (v) =>
      v.status === 'scheduled' &&
      !v.work_team_id &&
      v.timezone === 'Europe/Madrid' &&
      Date.parse(v.scheduled_start_at) > openedAt.getTime(),
  )
  const own = eligible.find((visit) => visit.id === ownId)
  const options = useQuery({
    queryKey: ['visit-swap-options', tenantId, userId, ownId, own?.updated_at, day],
    queryFn: () => listVisitSwapOptions(tenantId, ownId, day),
    enabled: Boolean(own) && day >= today && day <= until,
    retry: false,
  })
  const other = options.data?.find((option) => option.id === otherId)
  const submit = useMutation({
    mutationFn: () => {
      if (!own || !other) throw new Error('Selecciona dos visitas.')
      const selection = JSON.stringify([own.id, own.updated_at, other.id, other.version])
      const id = operationIds.current.get(selection) ?? crypto.randomUUID()
      operationIds.current.set(selection, id)
      return createVisitSwapProposal({ tenantId, id, own, other })
    },
    onSuccess: onConfirmed,
  })
  const loading = ownVisits.isPending || (own && options.isFetching)
  const canSubmit = own && other && ownVisits.isSuccess && options.isSuccess && !loading

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && close()}
      title="Proponer intercambio de visitas"
      description="Cambiaría quién hace cada visita, no sus horarios. Coordinación debe aprobarlo."
      submitLabel={submit.isError ? 'Reintentar propuesta' : 'Registrar propuesta'}
      submitDisabled={!canSubmit}
      isSubmitting={submit.isPending}
      onSubmit={() => submit.mutate()}
    >
      {ownVisits.isError ? (
        <div role="alert" className="flex flex-wrap gap-2 sm:col-span-2">
          No se pudieron consultar tus visitas.
          <Button type="button" variant="outline" onPress={() => void ownVisits.refetch()}>
            Reintentar visitas
          </Button>
        </div>
      ) : ownVisits.isSuccess && eligible.length === 0 ? (
        <p className="text-sm sm:col-span-2">
          No tienes visitas individuales pendientes en los próximos 14 días.
        </p>
      ) : (
        <>
          <label className="min-w-0 space-y-1 text-sm sm:col-span-2">
            <span className="block font-medium">Mi visita</span>
            <select
              className={controls}
              value={ownId}
              disabled={ownVisits.isPending}
              onChange={(event) => {
                setOwnId(event.target.value)
                setOtherId('')
                submit.reset()
              }}
            >
              <option value="">Selecciona una visita</option>
              {eligible.map((visit) => (
                <option key={visit.id} value={visit.id}>
                  {dateTime.format(new Date(visit.scheduled_start_at))} · {visit.title}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-sm sm:col-span-2">
            <span className="block font-medium">Día de la otra visita</span>
            <input
              className={controls}
              type="date"
              value={day}
              min={today}
              max={until}
              disabled={!own}
              onChange={(event) => {
                setDay(event.target.value)
                setOtherId('')
                submit.reset()
              }}
            />
          </label>
        </>
      )}
      {loading ? <output className="text-sm sm:col-span-2">Consultando visitas…</output> : null}
      {options.isError ? (
        <div role="alert" className="flex flex-wrap gap-2 text-sm sm:col-span-2">
          {options.error.message}
          <Button type="button" variant="outline" onPress={() => void options.refetch()}>
            Reintentar alternativas
          </Button>
        </div>
      ) : null}
      {own && options.isSuccess && !options.isFetching && options.data.length === 0 ? (
        <p className="text-sm sm:col-span-2">
          No hay alternativas con cobertura verificada para este día. Prueba otra fecha.
        </p>
      ) : null}
      {own && options.isSuccess && options.data.length > 0 ? (
        <label className="min-w-0 space-y-1 text-sm sm:col-span-2">
          <span className="block font-medium">Visita alternativa</span>
          <select
            className={controls}
            value={otherId}
            onChange={(event) => {
              setOtherId(event.target.value)
              submit.reset()
            }}
          >
            <option value="">Selecciona una franja</option>
            {options.data.map((option) => (
              <option key={option.id} value={option.id}>
                {option.colleague} · {timeRange(option.start_at, option.end_at)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {own && other ? (
        <div className="bg-muted min-w-0 space-y-1 rounded-md p-3 text-sm sm:col-span-2">
          <p className="font-medium">Si coordinación aprueba</p>
          <p>
            {other.colleague} hará tu visita:{' '}
            {timeRange(own.scheduled_start_at, own.scheduled_end_at)}.
          </p>
          <p>Tú harás la visita alternativa: {timeRange(other.start_at, other.end_at)}.</p>
        </div>
      ) : null}
      {submit.isError ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {submit.error.message}
        </p>
      ) : null}
    </FormDialog>
  )
}

function SwapComparison({ proposal, office }: { proposal: VisitSwapProposal; office: boolean }) {
  const requester = office ? proposal.requester || 'Técnico solicitante' : 'Tú'
  const colleague = proposal.colleague || 'Otro técnico'
  return (
    <div className="grid min-w-0 gap-2 text-sm sm:grid-cols-2">
      <div className="bg-muted min-w-0 rounded-md p-2 break-words">
        <p className="font-medium">{proposal.own_title || 'Primera visita'}</p>
        <p>{timeRange(proposal.own_start, proposal.own_end)}</p>
        <p>Antes: {requester}</p>
        <p>Propuesto: {colleague}</p>
      </div>
      <div className="bg-muted min-w-0 rounded-md p-2 break-words">
        <p className="font-medium">{proposal.other_title || 'Visita alternativa'}</p>
        <p>{timeRange(proposal.other_start, proposal.other_end)}</p>
        <p>Antes: {colleague}</p>
        <p>Propuesto: {requester}</p>
      </div>
    </div>
  )
}

function SwapInbox({
  tenantId,
  userId,
  office,
  onSaved,
}: Scope & { office: boolean; onSaved?: () => Promise<void> }) {
  const cache = useQueryClient()
  const key = proposalKey(tenantId, userId)
  const [newOpen, setNewOpen] = useState(false)
  const [review, setReview] = useState<{ request: VisitSwapProposal; action: VisitSwapDecision }>()
  const [feedback, setFeedback] = useState('')
  const proposals = useQuery({
    queryKey: key,
    queryFn: () => listVisitSwapProposals(tenantId),
    retry: false,
    refetchOnMount: 'always',
  })
  const decide = useMutation({
    mutationFn: ({ request, action }: NonNullable<typeof review>) =>
      decideVisitSwapProposal(tenantId, request, action),
    onSuccess: (_, { action }) => {
      setReview(undefined)
      setFeedback(
        action === 'approved'
          ? 'Intercambio aplicado a las dos visitas.'
          : action === 'rejected'
            ? 'Propuesta rechazada. No se cambió ninguna visita.'
            : 'Propuesta retirada. No se cambió ninguna visita.',
      )
      void cache.invalidateQueries({ queryKey: key })
      if (action === 'approved' && onSaved)
        void onSaved().catch(() => {
          setFeedback('Intercambio aplicado. Recarga la agenda para ver ambas asignaciones.')
        })
    },
    onError: () => void cache.invalidateQueries({ queryKey: key }),
  })
  function openReview(request: VisitSwapProposal, action: VisitSwapDecision) {
    setFeedback('')
    decide.reset()
    setReview({ request, action })
  }
  const current = proposals.data?.find((item) => item.id === review?.request.id)
  const expiredReview = review?.action === 'approved' && current?.stale
  return (
    <div className="space-y-3 p-3">
      {!office ? (
        <Button
          variant="outline"
          className="min-h-11"
          onPress={() => {
            setFeedback('')
            setNewOpen(true)
          }}
        >
          Proponer intercambio
        </Button>
      ) : null}
      {feedback ? <output className="block text-sm">{feedback}</output> : null}
      {proposals.isPending ? <output className="text-sm">Consultando propuestas…</output> : null}
      {proposals.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          {proposals.error.message}
          <Button variant="outline" className="min-h-11" onPress={() => void proposals.refetch()}>
            Reintentar propuestas
          </Button>
        </div>
      ) : null}
      {proposals.isSuccess && !proposals.data.length ? (
        <p className="text-muted-foreground text-sm">
          {office ? 'No hay propuestas que revisar.' : 'Todavía no has registrado propuestas.'}
        </p>
      ) : null}
      <ul className="space-y-3">
        {(proposals.isFetchedAfterMount && !proposals.isError ? (proposals.data ?? []) : []).map(
          (request) => (
            <li key={request.id} className="border-border min-w-0 space-y-2 rounded-lg border p-3">
              <p className="text-sm font-semibold break-words">{status[request.state]}</p>
              <SwapComparison proposal={request} office={office} />
              {request.stale ? (
                <p className="text-destructive text-sm">
                  Cambió la planificación. Esta propuesta ya no se puede aprobar.
                </p>
              ) : null}
              {request.state === 'pending' ? (
                <div className="flex flex-wrap gap-2">
                  {office ? (
                    <>
                      <Button
                        variant="outline"
                        className="min-h-11"
                        isDisabled={request.stale}
                        onPress={() => openReview(request, 'approved')}
                      >
                        Revisar aprobación
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-11"
                        onPress={() => openReview(request, 'rejected')}
                      >
                        Rechazar
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onPress={() => openReview(request, 'withdrawn')}
                    >
                      Retirar
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ),
        )}
      </ul>
      {newOpen ? (
        <NewSwapForm
          tenantId={tenantId}
          userId={userId}
          close={() => setNewOpen(false)}
          onConfirmed={(state) => {
            setNewOpen(false)
            setFeedback(
              state === 'pending'
                ? 'Propuesta registrada. Aún no cambió ninguna visita.'
                : status[state],
            )
            void cache.invalidateQueries({ queryKey: key })
          }}
        />
      ) : null}
      {review ? (
        <FormDialog
          open
          onOpenChange={(open) => !open && setReview(undefined)}
          title={decisionText[review.action]}
          description={
            review.action === 'approved'
              ? 'Confirma el cambio de técnicos en las dos visitas. Los horarios se mantienen.'
              : 'Esta decisión no cambiará ninguna visita.'
          }
          submitLabel={decisionText[review.action]}
          submitDisabled={Boolean(expiredReview)}
          isSubmitting={decide.isPending}
          onSubmit={() => decide.mutate(review)}
        >
          <div className="space-y-2 sm:col-span-2">
            <SwapComparison proposal={review.request} office={office} />
            {decide.isError ? (
              <p role="alert" className="text-destructive text-sm">
                {decide.error.message}
              </p>
            ) : null}
            {expiredReview ? (
              <p className="text-destructive text-sm">
                La agenda cambió. Cierra esta revisión y rechaza o deja pendiente la propuesta.
              </p>
            ) : null}
          </div>
        </FormDialog>
      ) : null}
    </div>
  )
}

export function VisitSwapsPanel(props: Scope & { office: boolean; onSaved?: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const label = props.office ? 'Propuestas de intercambio' : 'Intercambiar visitas'
  return (
    <section className="border-border bg-card min-w-0 rounded-xl border">
      <Button
        className="min-h-11 w-full justify-start"
        variant="ghost"
        aria-expanded={open}
        aria-controls={id}
        onPress={() => setOpen((previous) => !previous)}
      >
        {label}
      </Button>
      <div id={id} hidden={!open}>
        {open ? <SwapInbox {...props} /> : null}
      </div>
    </section>
  )
}
