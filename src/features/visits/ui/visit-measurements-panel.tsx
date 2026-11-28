import { Button } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'

import { useBrowserOnline } from '@/shared/lib/use-browser-online'

import {
  readVisitMeasurementContext,
  recordVisitMeasurement,
  type MeasurementAttempt,
  type VisitMeasurement,
} from '../application/visit-measurement-actions'
import { parseMeasurementValue } from '../domain/measurement-value'

const control = 'border-border bg-background min-h-11 w-full rounded-md border px-3 text-sm'
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 })

function dateLabel(stamp: string, timezone: string) {
  const value = new Date(stamp)
  try {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(value)
  } catch {
    return Number.isNaN(value.getTime()) ? 'Fecha no disponible' : value.toISOString()
  }
}

function MeasurementRow({ reading, timezone }: { reading: VisitMeasurement; timezone: string }) {
  const prior = reading.previous
  return (
    <li className="border-border min-w-0 space-y-2 rounded-lg border p-3 text-sm">
      <div className="min-w-0 break-words">
        <p className="font-semibold">
          {reading.label}: {number.format(reading.value)} {reading.unit}
        </p>
        <p>
          Medido con {reading.method}.{' '}
          <time dateTime={reading.measured_at}>{dateLabel(reading.measured_at, timezone)}</time>
        </p>
      </div>
      {prior ? (
        <div className="bg-muted min-w-0 rounded-md p-2 break-words">
          <p className="font-medium">
            Lectura anterior comparable: {number.format(prior.value)} {prior.unit}
          </p>
          <p>
            <time dateTime={prior.measured_at}>{dateLabel(prior.measured_at, timezone)}</time>
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">
          Sin lectura anterior comparable con la misma unidad y método.
        </p>
      )}
    </li>
  )
}

export function VisitMeasurementsPanel({
  tenantId,
  visitId,
  userId,
  timezone,
  readOnly,
}: {
  tenantId: string
  visitId: string
  userId: string
  timezone: string
  readOnly: boolean
}) {
  const title = useId()
  const cache = useQueryClient()
  const online = useBrowserOnline()
  const key = ['visit-measurements', tenantId, userId, visitId] as const
  const context = useQuery({
    queryKey: key,
    queryFn: () => readVisitMeasurementContext(tenantId, visitId),
    retry: false,
    refetchOnMount: 'always',
  })
  const [selected, setSelected] = useState<{ id: string; version: string }>()
  const [input, setInput] = useState('')
  const [method, setMethod] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const attempt = useRef<MeasurementAttempt | null>(null)
  const sending = useRef(false)
  const parameter = context.data?.parameters.find(({ id }) => id === selected?.id)
  const changedParameter = selected && (!parameter || selected.version !== parameter.version)
  const value = parseMeasurementValue(input)
  const save = useMutation({
    mutationFn: (measurement: MeasurementAttempt) =>
      recordVisitMeasurement(tenantId, visitId, measurement),
    onSuccess: async () => {
      setInput('')
      attempt.current = null
      setConfirmed(true)
      await cache.invalidateQueries({ queryKey: key })
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: key })
    },
    onSettled: () => {
      sending.current = false
    },
  })

  if (context.isPending || (context.isFetching && !context.isFetchedAfterMount)) return null
  if (context.isError)
    return (
      <div className="border-border space-y-2 border-t pt-4">
        <p role="alert">No se pudieron consultar las mediciones del parte.</p>
        <Button
          type="button"
          variant="outline"
          isDisabled={!online}
          onPress={() => void context.refetch()}
        >
          Reintentar mediciones
        </Button>
      </div>
    )
  if (!context.data?.supported) return null

  const available = context.data.parameters
  const readings = context.data.readings
  const methodValue = method.trim()
  const valid =
    online &&
    !readOnly &&
    parameter &&
    !changedParameter &&
    value !== null &&
    methodValue.length >= 2 &&
    methodValue.length <= 100

  function setParameter(id: string) {
    const selection = available.find((item) => item.id === id)
    setSelected(selection ? { id: selection.id, version: selection.version } : undefined)
    setInput('')
    setConfirmed(false)
    attempt.current = null
    save.reset()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || !parameter || value === null || sending.current) return
    sending.current = true
    setConfirmed(false)
    const savedAttempt = attempt.current
    const matching =
      savedAttempt &&
      savedAttempt.parameter.id === parameter.id &&
      savedAttempt.parameter.version === parameter.version &&
      savedAttempt.value === value &&
      savedAttempt.method === methodValue
    const write = matching
      ? savedAttempt
      : {
          parameter,
          value,
          method: methodValue,
          operationId: crypto.randomUUID(),
          measuredAt: new Date().toISOString(),
        }
    attempt.current = write
    save.mutate(write)
  }

  return (
    <section aria-labelledby={title} className="border-border min-w-0 space-y-3 border-t pt-4">
      <h3 id={title} className="font-semibold">
        Mediciones
      </h3>
      <p className="text-muted-foreground text-sm">
        Solo se compara con otra visita terminada de esta piscina, con el mismo parámetro, unidad y
        método.
      </p>
      {!readOnly && available.length ? (
        <form aria-label="Registrar medición" onSubmit={submit} className="space-y-3">
          <fieldset disabled={save.isPending} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="min-w-0 space-y-1 text-sm sm:col-span-2">
              <span className="block font-medium">Parámetro</span>
              <select
                className={control}
                value={selected?.id ?? ''}
                onChange={(event) => setParameter(event.target.value)}
              >
                <option value="">Selecciona un parámetro</option>
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} ({item.unit})
                  </option>
                ))}
              </select>
            </label>
            {changedParameter ? (
              <div className="space-y-2 sm:col-span-2">
                <p role="alert">
                  Cambió la configuración. Vuelve a elegir el parámetro y revisa el valor.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onPress={() => setParameter(parameter?.id ?? '')}
                >
                  Revisar parámetro
                </Button>
              </div>
            ) : null}
            <label className="min-w-0 space-y-1 text-sm">
              <span className="block font-medium break-words">
                Valor {parameter ? `(${parameter.unit})` : ''}
              </span>
              <input
                inputMode="decimal"
                maxLength={16}
                className={control}
                disabled={!parameter || Boolean(changedParameter)}
                value={input}
                aria-invalid={Boolean(input && value === null)}
                onChange={(event) => {
                  setInput(event.target.value)
                  setConfirmed(false)
                  save.reset()
                }}
              />
            </label>
            <label className="min-w-0 space-y-1 text-sm">
              <span className="block font-medium">Método de medición</span>
              <input
                className={control}
                maxLength={100}
                value={method}
                placeholder="Ej. pH-metro"
                onChange={(event) => {
                  setMethod(event.target.value)
                  setConfirmed(false)
                  save.reset()
                }}
              />
            </label>
          </fieldset>
          {input && value === null ? (
            <p className="text-destructive text-sm">
              Introduce un valor numérico con hasta tres decimales.
            </p>
          ) : null}
          {!online ? (
            <p className="text-muted-foreground text-sm">
              Sin conexión. El valor no se guarda como borrador. Vuelve a conectarte para
              registrarlo.
            </p>
          ) : null}
          {save.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {save.error.message}
            </p>
          ) : null}
          {confirmed ? <output className="block text-sm">Medición registrada.</output> : null}
          <Button type="submit" disabled={!valid || save.isPending} className="min-h-11">
            {save.isPending
              ? 'Registrando…'
              : save.isError
                ? 'Reintentar medición'
                : 'Registrar medición'}
          </Button>
        </form>
      ) : !readOnly ? (
        <p className="text-muted-foreground text-sm">
          Esta piscina no tiene parámetros de medición disponibles.
        </p>
      ) : null}
      {readings.length ? (
        <ul aria-label="Mediciones registradas" className="space-y-2">
          {readings.map((reading) => (
            <MeasurementRow key={reading.id} reading={reading} timezone={timezone} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No hay mediciones registradas en esta visita.
        </p>
      )}
    </section>
  )
}
