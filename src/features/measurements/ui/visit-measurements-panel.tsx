import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  listMeasurements,
  listVisitParameters,
  recordMeasurement,
  type Measurement,
} from '../application/measurement-actions'
import {
  measurementQueueKey,
  readMeasurementQueue,
  writeMeasurementQueue,
  type PendingMeasurement,
} from '../application/measurement-queue'

const assessmentLabels = {
  below: 'Por debajo del rango configurado',
  within: 'Dentro del rango configurado',
  above: 'Por encima del rango configurado',
  unconfigured: 'Sin rango configurado',
}

function localDateTime(iso: string) {
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19)
}

export function VisitMeasurementsPanel({
  tenantId,
  visitId,
  userId,
  closed,
}: {
  tenantId: string
  visitId: string
  userId: string
  closed: boolean
}) {
  const queryClient = useQueryClient()
  const queueKey = measurementQueueKey(userId, tenantId, visitId)
  const parameters = useQuery({
    queryKey: ['visit-measurement-parameters', tenantId, visitId],
    queryFn: () => listVisitParameters(tenantId, visitId),
  })
  const [page, setPage] = useState(0)
  const readingsKey = ['visit-measurements', tenantId, visitId, page]
  const readings = useQuery({
    queryKey: readingsKey,
    queryFn: () => listMeasurements(tenantId, { visitId }, page),
  })
  const [queue, setQueue] = useState(() => readMeasurementQueue(queueKey))
  const [parameterId, setParameterId] = useState('')
  const [value, setValue] = useState('')
  const [method, setMethod] = useState('Medidor manual')
  const [device, setDevice] = useState('')
  const [measuredAt, setMeasuredAt] = useState(() => localDateTime(new Date().toISOString()))
  const [supersedesId, setSupersedesId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [storageFailed, setStorageFailed] = useState(false)
  const activeParameterId = parameterId || parameters.data?.[0]?.parameter_id || ''
  const selected = parameters.data?.find((item) => item.parameter_id === activeParameterId)

  async function send(item: PendingMeasurement) {
    await recordMeasurement({
      tenantId,
      visitId,
      parameterId: item.parameterId,
      value: item.value,
      method: item.method,
      device: item.device,
      measuredAt: item.measuredAt,
      supersedesId: item.supersedesId,
      operationId: item.operationId,
    })
    const next = readMeasurementQueue(queueKey).filter(
      (pending) => pending.operationId !== item.operationId,
    )
    setStorageFailed(!writeMeasurementQueue(queueKey, next))
    setQueue(next)
    await queryClient.invalidateQueries({ queryKey: ['visit-measurements', tenantId, visitId] })
    setPage(0)
    if (selected)
      await queryClient.invalidateQueries({
        queryKey: ['pool-measurements', tenantId, selected.asset_id],
      })
  }

  async function submit() {
    const numericValue = Number(value)
    const measuredDate = new Date(measuredAt)
    if (
      !activeParameterId ||
      !value.trim() ||
      !Number.isFinite(numericValue) ||
      !method.trim() ||
      !Number.isFinite(measuredDate.getTime()) ||
      busy ||
      closed
    )
      return
    if (
      numericValue < -100000 ||
      numericValue > 100000 ||
      measuredDate.getTime() > new Date().getTime() + 5 * 60_000 ||
      Number(numericValue.toFixed(3)) !== numericValue ||
      method.trim().length < 2 ||
      method.trim().length > 100 ||
      (selected?.code === 'ph' && (numericValue < 0 || numericValue > 14)) ||
      (selected?.code === 'disinfectant' && (numericValue < 0 || numericValue > 100)) ||
      (selected?.code === 'temperature' && (numericValue < -20 || numericValue > 80))
    ) {
      toast.error('Revisa el valor y el método antes de registrar la lectura')
      return
    }
    const item: PendingMeasurement = {
      operationId: crypto.randomUUID(),
      parameterId: activeParameterId,
      value: numericValue,
      method: method.trim(),
      device: device.trim(),
      measuredAt: measuredDate.toISOString(),
      supersedesId,
    }
    const next = [...queue, item]
    if (!writeMeasurementQueue(queueKey, next)) {
      setStorageFailed(true)
      toast.error('No se pudo conservar la lectura en este dispositivo')
      return
    }
    setQueue(next)
    setBusy(true)
    try {
      await send(item)
      setValue('')
      setMeasuredAt(localDateTime(new Date().toISOString()))
      setSupersedesId(null)
      toast.success('Lectura registrada')
    } catch (error) {
      toast.error('Lectura pendiente de envío', {
        description:
          error instanceof Error ? error.message : 'Reintenta cuando vuelva la conexión.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function retry(item: PendingMeasurement) {
    if (busy) return
    setBusy(true)
    try {
      await send(item)
      toast.success('Lectura registrada')
    } catch (error) {
      toast.error('No se pudo enviar la lectura', {
        description: error instanceof Error ? error.message : 'Reintenta más tarde.',
      })
    } finally {
      setBusy(false)
    }
  }

  function correct(reading: Measurement) {
    setParameterId(reading.parameter_id)
    setValue(String(reading.value))
    setMethod(reading.method)
    setDevice(reading.device)
    setMeasuredAt(localDateTime(reading.measured_at))
    setSupersedesId(reading.id)
  }

  function discard(item: PendingMeasurement) {
    if (!window.confirm('¿Descartar esta lectura pendiente? No se enviará a la empresa.')) return
    const next = queue.filter((pending) => pending.operationId !== item.operationId)
    if (!writeMeasurementQueue(queueKey, next)) {
      setStorageFailed(true)
      toast.error('No se pudo descartar la lectura del dispositivo')
      return
    }
    setQueue(next)
  }

  return (
    <section className="border-border space-y-3 border-t pt-4" aria-label="Mediciones de piscina">
      <h3 className="font-semibold">Mediciones de piscina</h3>
      {parameters.isError || readings.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar las mediciones.
        </p>
      ) : null}
      {parameters.isPending ? (
        <p className="text-muted-foreground text-sm">Cargando parámetros…</p>
      ) : null}
      {parameters.isSuccess && parameters.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">Esta visita no tiene una piscina asignada.</p>
      ) : null}
      {parameters.data?.length && !closed ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Parámetro
            <select
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              value={activeParameterId}
              onChange={(event) => {
                setParameterId(event.target.value)
                setSupersedesId(null)
              }}
            >
              {parameters.data.map((item) => (
                <option key={item.parameter_id} value={item.parameter_id}>
                  {item.label} ({item.unit})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Valor {selected ? `(${selected.unit})` : ''}
            <input
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              type="number"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Método
            <input
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              maxLength={100}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Equipo utilizado (opcional)
            <input
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              maxLength={160}
              value={device}
              onChange={(event) => setDevice(event.target.value)}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Fecha y hora de la lectura
            <input
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              type="datetime-local"
              step="1"
              value={measuredAt}
              onChange={(event) => setMeasuredAt(event.target.value)}
            />
          </label>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground text-xs">
              {selected?.min_value == null
                ? 'Sin rango configurado'
                : `Rango configurado: ${selected.min_value}–${selected.max_value} ${selected.unit}`}
              . La lectura se fecha al registrarla.
            </p>
            {supersedesId ? (
              <p className="text-warning text-sm">
                Corrección de una lectura anterior. El original permanecerá en el historial.
              </p>
            ) : null}
            <Button
              isDisabled={busy || !value.trim() || !method.trim()}
              onPress={() => void submit()}
            >
              {busy ? 'Enviando…' : supersedesId ? 'Registrar corrección' : 'Registrar lectura'}
            </Button>
            {supersedesId ? (
              <Button
                variant="ghost"
                onPress={() => {
                  setSupersedesId(null)
                  setValue('')
                }}
              >
                Cancelar corrección
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {storageFailed ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudo actualizar la copia local. Comprueba el historial antes de salir.
        </p>
      ) : null}
      {queue.length ? (
        <div className="border-warning rounded-lg border p-3 text-sm">
          <p className="font-medium">Lecturas pendientes en este dispositivo</p>
          <ul className="mt-2 space-y-2">
            {queue.map((item) => (
              <li key={item.operationId} className="flex flex-wrap items-center gap-2">
                <span>
                  {parameters.data?.find((parameter) => parameter.parameter_id === item.parameterId)
                    ?.label ?? 'Parámetro'}
                  : {item.value}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  isDisabled={busy}
                  onPress={() => void retry(item)}
                >
                  Reintentar
                </Button>
                <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => discard(item)}>
                  Descartar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <MeasurementHistory
        readings={readings.data?.entries ?? []}
        supersededIds={readings.data?.supersededIds ?? []}
        canCorrect={!closed}
        onCorrect={correct}
      />
      {(readings.data?.count ?? 0) > 0 ? (
        <div className="flex items-center gap-3 text-sm">
          <Button
            size="sm"
            variant="outline"
            isDisabled={page === 0}
            onPress={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span>
            Página {page + 1} de{' '}
            {Math.ceil((readings.data?.count ?? 0) / (readings.data?.pageSize ?? 25))}
          </span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={(page + 1) * (readings.data?.pageSize ?? 25) >= (readings.data?.count ?? 0)}
            onPress={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </section>
  )
}

export function MeasurementHistory({
  readings,
  supersededIds,
  canCorrect,
  onCorrect,
}: {
  readings: Measurement[]
  supersededIds: string[]
  canCorrect: boolean
  onCorrect?: (reading: Measurement) => void
}) {
  if (!readings.length)
    return <p className="text-muted-foreground text-sm">Aún no hay lecturas registradas.</p>
  const correctedIds = new Set(supersededIds)
  return (
    <ol className="space-y-2 text-sm">
      {readings.map((reading) => (
        <li key={reading.id} className="bg-surface-subtle rounded-lg p-2">
          <span className="font-medium">
            {reading.label_snapshot}: {reading.value} {reading.unit_snapshot}
          </span>
          {' · '}
          {assessmentLabels[reading.assessment]}
          {correctedIds.has(reading.id) ? ' · Corregida' : null}
          {reading.supersedes_id ? ' · Corrección' : null}
          <p className="text-muted-foreground">
            {new Date(reading.measured_at).toLocaleString('es-ES')} · {reading.method}
            {reading.device ? ` · ${reading.device}` : ''}
          </p>
          {canCorrect && !correctedIds.has(reading.id) && onCorrect ? (
            <Button size="sm" variant="ghost" onPress={() => onCorrect(reading)}>
              Corregir
            </Button>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
