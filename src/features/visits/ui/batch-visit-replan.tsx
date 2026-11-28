import { Button } from '@doscientos/ui'
import { useEffect, useRef, useState } from 'react'

import { FormDialog } from '@/shared/ui/form-dialog'

import {
  applyVisitBatch,
  canRetryBatchVisit,
  prepareVisitBatch,
  type BatchVisitResult,
} from '../application/batch-visit-replan-actions'
import type { VisitSummary } from '../application/visit-actions'
import {
  maxBatchVisits,
  maxShiftMinutes,
  type BatchVisitProposal,
} from '../domain/batch-visit-replan'

const labels: Record<BatchVisitResult['status'], string> = {
  applied: 'Aplicada',
  rejected: 'Rechazada',
  unconfirmed: 'Sin confirmar',
  blocked: 'No intentada',
}
const factors = { minutes: 1, hours: 60, days: 1_440 } as const
const control = 'border-border bg-background min-h-11 w-full rounded-md border px-3 text-sm'

function wallLabel(stamp: string) {
  if (!stamp) return 'No disponible'
  const [date, time] = stamp.split('T')
  return `${date?.split('-').reverse().join('/')} · ${time}`
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function scheduleLabel(visit: VisitSummary) {
  const timezone = visit.timezone
  try {
    let formatter = formatters.get(timezone)
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: timezone,
      })
      formatters.set(timezone, formatter)
    }
    return formatter.format(new Date(visit.scheduled_start_at))
  } catch {
    return 'Horario sin verificar'
  }
}

export function BatchVisitReplan({
  tenantId,
  visits,
  disabled,
  onSaved,
}: {
  tenantId: string
  visits: VisitSummary[]
  disabled: boolean
  onSaved: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        className="max-sm:min-h-11"
        isDisabled={disabled || visits.filter(({ status }) => status === 'scheduled').length < 2}
        onPress={() => setOpen(true)}
      >
        Reprogramar varias visitas
      </Button>
      {open ? (
        <BatchDialog
          tenantId={tenantId}
          visits={visits.filter(({ status }) => status === 'scheduled')}
          onSaved={onSaved}
          onClose={() => {
            setOpen(false)
            requestAnimationFrame(() => triggerRef.current?.focus())
          }}
        />
      ) : null}
    </>
  )
}

function BatchDialog({
  tenantId,
  visits,
  onClose,
  onSaved,
}: {
  tenantId: string
  visits: VisitSummary[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [selection, setSelection] = useState<Set<string>>(() => new Set())
  const [direction, setDirection] = useState(1)
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState<keyof typeof factors>('hours')
  const [proposal, setProposal] = useState<BatchVisitProposal | null>(null)
  const [results, setResults] = useState<BatchVisitResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const phase = results.length ? 'results' : proposal ? 'preview' : 'selection'
  const heading = useRef<HTMLHeadingElement>(null)
  const inFlight = useRef(false)
  const operations = useRef(new Map<string, string>())
  const shift = direction * Number(amount) * factors[unit]
  const selectedVisits = visits.filter(({ id }) => selection.has(id))
  const canPrepare =
    Number.isInteger(Number(amount)) &&
    Number(amount) > 0 &&
    Math.abs(shift) <= maxShiftMinutes &&
    selectedVisits.length >= 2 &&
    selectedVisits.length <= maxBatchVisits
  const canApply = !!proposal?.slots.length && proposal.sequence.length === proposal.slots.length
  const canRetry =
    !!proposal && results.some((result) => canRetryBatchVisit(result, results, proposal))
  const applied = results.filter(({ status }) => status === 'applied').length
  const resultById = new Map(results.map((result) => [result.id, result]))

  useEffect(() => {
    if (phase !== 'selection') heading.current?.focus()
  }, [phase])

  async function submit() {
    if (inFlight.current) return
    if (phase === 'results' && !canRetry) {
      onClose()
      return
    }
    if ((phase === 'selection' && !canPrepare) || (phase === 'preview' && !canApply)) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      if (!proposal) {
        setProposal(
          await prepareVisitBatch(
            tenantId,
            visits.filter(({ id }) => selection.has(id)),
            shift,
          ),
        )
      } else {
        await applyVisitBatch({
          tenantId,
          proposal,
          previous: results,
          operations: operations.current,
          onResult: (result) =>
            setResults((old) => [...old.filter(({ id }) => id !== result.id), result]),
        })
        await onSaved()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo comprobar la propuesta.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const submitLabel =
    phase === 'results'
      ? canRetry
        ? 'Reintentar pendientes'
        : 'Cerrar resultados'
      : phase === 'preview'
        ? `Confirmar ${proposal?.slots.length ?? 0} cambios`
        : 'Preparar propuesta'

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Reprogramar varias visitas"
      description="Mueve solo las visitas seleccionadas. Se conservan su duración, su asignación y las reglas de las series."
      submitLabel={busy ? (phase === 'selection' ? 'Comprobando…' : 'Guardando…') : submitLabel}
      submitDisabled={phase === 'selection' ? !canPrepare : phase === 'preview' ? !canApply : false}
      isSubmitting={busy}
      onSubmit={() => void submit()}
    >
      {error ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {error}
        </p>
      ) : null}
      {phase === 'selection' ? (
        <>
          <fieldset className="grid min-w-0 gap-2 sm:col-span-2 sm:grid-cols-3">
            <legend className="mb-2 font-medium">
              Desplazar el inicio en la hora local de cada visita
            </legend>
            <label className="space-y-1 text-sm">
              <span>Dirección</span>
              <select
                className={control}
                value={direction}
                onChange={(event) => setDirection(Number(event.target.value))}
              >
                <option value={1}>Mover más tarde</option>
                <option value={-1}>Adelantar</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Cantidad</span>
              <input
                className={control}
                type="number"
                min={1}
                max={maxShiftMinutes / factors[unit]}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Unidad</span>
              <select
                className={control}
                value={unit}
                onChange={(event) => setUnit(event.target.value as keyof typeof factors)}
              >
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Días</option>
              </select>
            </label>
          </fieldset>
          <fieldset className="min-w-0 space-y-2 sm:col-span-2">
            <legend className="font-medium">Visitas planificadas de esta vista</legend>
            <p aria-live="polite" className="text-muted-foreground text-sm">
              {selectedVisits.length} seleccionadas (de 2 a {maxBatchVisits}). Máximo: 7 días.
            </p>
            <div className="max-h-56 overflow-y-auto">
              {visits.map((visit) => (
                <label
                  key={visit.id}
                  aria-label={`${visit.title}, ${scheduleLabel(visit)}, ${visit.client_name}`}
                  className="border-border flex min-h-11 cursor-pointer items-center gap-3 rounded border p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0"
                    checked={selection.has(visit.id)}
                    disabled={selectedVisits.length >= maxBatchVisits && !selection.has(visit.id)}
                    onChange={(event) => {
                      const checked = event.target.checked
                      setSelection((old) => {
                        const next = new Set(
                          visits.filter(({ id }) => old.has(id)).map(({ id }) => id),
                        )
                        if (checked && next.size < maxBatchVisits) next.add(visit.id)
                        else if (!checked) next.delete(visit.id)
                        return next
                      })
                    }}
                  />
                  <span className="min-w-0 break-words">
                    <span className="block font-medium">{visit.title}</span>
                    <span className="text-muted-foreground">
                      {scheduleLabel(visit)} · {visit.client_name}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <section className="min-w-0 space-y-3 sm:col-span-2">
          <h3 ref={heading} tabIndex={-1} className="font-semibold">
            {phase === 'results' ? 'Resultado de los cambios' : 'Vista previa'}
          </h3>
          {phase === 'results' ? (
            <output className="block text-sm">
              {applied} de {proposal?.slots.length ?? 0} cambios confirmados.
              {!busy && applied > 0 && applied !== proposal?.slots.length
                ? ' Resultado parcial.'
                : ''}
              {!busy && canRetry
                ? ' Puedes reintentar las visitas no confirmadas sin repetir las ya aplicadas.'
                : ''}
            </output>
          ) : (
            <p className="text-sm">
              {canApply
                ? 'No se detectaron conflictos ahora. Se guardará una visita cada vez; puede haber un resultado parcial si cambia la agenda.'
                : 'Hay conflictos. Ajusta la selección o el desplazamiento y prepara otra propuesta.'}
            </p>
          )}
          <ol className="border-border divide-border divide-y rounded-md border">
            {proposal?.slots.map((slot) => {
              const result = resultById.get(slot.visit.id)
              return (
                <li key={slot.visit.id} className="min-w-0 space-y-1 p-3 text-sm break-words">
                  <p className="font-medium">{slot.visit.title}</p>
                  <p className="text-muted-foreground">
                    {slot.visit.timezone} ·{' '}
                    {Number.isFinite(slot.durationMinutes)
                      ? `${slot.durationMinutes} min`
                      : 'Duración sin verificar'}
                  </p>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
                    <dt className="font-medium">Antes</dt>
                    <dd>{wallLabel(slot.oldLocal)}</dd>
                    <dt className="font-medium">Propuesta</dt>
                    <dd>{wallLabel(slot.newLocal)}</dd>
                  </dl>
                  {slot.blockers.length > 0 ? (
                    <ul className="text-destructive list-disc space-y-1 pl-4">
                      {slot.blockers.map((blocker, index) => (
                        <li key={`${index}:${blocker}`}>{blocker}</li>
                      ))}
                    </ul>
                  ) : null}
                  {result ? (
                    <p
                      className={
                        result.status === 'applied' ? 'text-primary' : 'text-muted-foreground'
                      }
                    >
                      <strong>{labels[result.status]}:</strong> {result.detail}
                    </p>
                  ) : phase === 'results' ? (
                    <p className="text-muted-foreground">Pendiente</p>
                  ) : null}
                </li>
              )
            })}
          </ol>
          {phase === 'preview' ? (
            <Button variant="outline" onPress={() => setProposal(null)}>
              Editar propuesta
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">
              Si hay cambios rechazados o sin confirmar, revisa la agenda antes de preparar otra
              propuesta.
            </p>
          )}
        </section>
      )}
    </FormDialog>
  )
}
