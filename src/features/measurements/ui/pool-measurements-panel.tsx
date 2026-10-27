import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  configureParameter,
  listMeasurements,
  listParameterEvents,
  listPoolParameters,
  type MeasurementParameter,
} from '../application/measurement-actions'
import { MeasurementHistory } from './visit-measurements-panel'

export function PoolMeasurementsPanel({
  tenantId,
  assetId,
  canWrite,
}: {
  tenantId: string
  assetId: string
  canWrite: boolean
}) {
  const parameterKey = ['pool-parameters', tenantId, assetId]
  const [page, setPage] = useState(0)
  const measurements = useQuery({
    queryKey: ['pool-measurements', tenantId, assetId, page],
    queryFn: () => listMeasurements(tenantId, { assetId }, page),
  })
  const parameters = useQuery({
    queryKey: parameterKey,
    queryFn: () => listPoolParameters(tenantId, assetId),
  })
  const events = useQuery({
    queryKey: ['pool-parameter-events', tenantId, assetId],
    queryFn: () => listParameterEvents(tenantId, assetId),
    enabled: canWrite,
  })
  const [adding, setAdding] = useState(false)
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [unit, setUnit] = useState('')
  const queryClient = useQueryClient()

  async function configured() {
    await queryClient.invalidateQueries({ queryKey: parameterKey })
    await queryClient.invalidateQueries({ queryKey: ['pool-parameter-events', tenantId, assetId] })
  }

  return (
    <section
      className="border-border mt-4 space-y-3 border-t pt-3 text-sm"
      aria-label="Mediciones de piscina"
    >
      <h4 className="font-semibold">Parámetros y lecturas</h4>
      {parameters.isError || measurements.isError ? (
        <p role="alert" className="text-destructive">
          No se pudieron cargar los parámetros o las lecturas.
        </p>
      ) : null}
      {parameters.isPending ? <p>Cargando parámetros…</p> : null}
      <div className="space-y-2">
        {parameters.data?.map((parameter) => (
          <ParameterRow
            key={parameter.id}
            parameter={parameter}
            tenantId={tenantId}
            assetId={assetId}
            canWrite={canWrite}
            onSaved={configured}
          />
        ))}
      </div>
      {canWrite ? (
        <div>
          {adding ? (
            <div className="border-border grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
              <label>
                Código{' '}
                <input
                  className="border-input bg-background w-full rounded-lg border p-2"
                  value={code}
                  maxLength={40}
                  onChange={(event) =>
                    setCode(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                  }
                  placeholder="alcalinidad"
                />
              </label>
              <label>
                Nombre{' '}
                <input
                  className="border-input bg-background w-full rounded-lg border p-2"
                  value={label}
                  maxLength={100}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </label>
              <label>
                Unidad{' '}
                <input
                  className="border-input bg-background w-full rounded-lg border p-2"
                  value={unit}
                  maxLength={24}
                  onChange={(event) => setUnit(event.target.value)}
                />
              </label>
              <div className="flex gap-2 sm:col-span-3">
                <Button
                  size="sm"
                  isDisabled={!code || !label.trim() || !unit.trim()}
                  onPress={() =>
                    void (async () => {
                      try {
                        await configureParameter({
                          tenantId,
                          assetId,
                          code,
                          label,
                          unit,
                          minValue: null,
                          maxValue: null,
                          active: true,
                          expectedUpdatedAt: null,
                          operationId: crypto.randomUUID(),
                        })
                        await configured()
                        setAdding(false)
                        setCode('')
                        setLabel('')
                        setUnit('')
                        toast.success('Parámetro añadido')
                      } catch (error) {
                        toast.error('No se pudo añadir el parámetro', {
                          description:
                            error instanceof Error ? error.message : 'Inténtalo de nuevo.',
                        })
                      }
                    })()
                  }
                >
                  Añadir
                </Button>
                <Button size="sm" variant="ghost" onPress={() => setAdding(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onPress={() => setAdding(true)}>
              Añadir parámetro
            </Button>
          )}
        </div>
      ) : null}
      <details>
        <summary className="text-primary cursor-pointer font-medium">Historial de lecturas</summary>
        <div className="mt-2">
          <MeasurementHistory
            readings={measurements.data?.entries ?? []}
            supersededIds={measurements.data?.supersededIds ?? []}
            canCorrect={false}
          />
          {(measurements.data?.count ?? 0) > 0 ? (
            <div className="mt-2 flex items-center gap-3">
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
                {Math.ceil((measurements.data?.count ?? 0) / (measurements.data?.pageSize ?? 25))}
              </span>
              <Button
                size="sm"
                variant="outline"
                isDisabled={
                  (page + 1) * (measurements.data?.pageSize ?? 25) >=
                  (measurements.data?.count ?? 0)
                }
                onPress={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </div>
          ) : null}
        </div>
      </details>
      {canWrite && (events.data?.length ?? 0) > 0 ? (
        <details>
          <summary className="text-primary cursor-pointer font-medium">
            Cambios de configuración
          </summary>
          <ol className="mt-2 space-y-1">
            {events.data?.map((event) => (
              <li key={event.operation_id}>
                {new Date(event.occurred_at).toLocaleString('es-ES')} ·{' '}
                {event.after_state.label ?? 'Parámetro'} ·{' '}
                {event.after_state.min_value == null
                  ? 'Sin rango'
                  : `${event.after_state.min_value}–${event.after_state.max_value} ${event.after_state.unit ?? ''}`}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  )
}

function ParameterRow({
  parameter,
  tenantId,
  assetId,
  canWrite,
  onSaved,
}: {
  parameter: MeasurementParameter
  tenantId: string
  assetId: string
  canWrite: boolean
  onSaved: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [min, setMin] = useState(parameter.min_value == null ? '' : String(parameter.min_value))
  const [max, setMax] = useState(parameter.max_value == null ? '' : String(parameter.max_value))
  const [busy, setBusy] = useState(false)
  const validRange =
    (min === '' && max === '') ||
    (min !== '' &&
      max !== '' &&
      Number.isFinite(Number(min)) &&
      Number.isFinite(Number(max)) &&
      Number(min) < Number(max))

  async function save() {
    if (!validRange || busy) return
    setBusy(true)
    try {
      await configureParameter({
        tenantId,
        assetId,
        code: parameter.code,
        label: parameter.label,
        unit: parameter.unit,
        minValue: min === '' ? null : Number(min),
        maxValue: max === '' ? null : Number(max),
        active: parameter.active,
        expectedUpdatedAt: parameter.updated_at,
        operationId: crypto.randomUUID(),
      })
      await onSaved()
      setEditing(false)
      toast.success('Rango actualizado')
    } catch (error) {
      toast.error('No se pudo actualizar el rango', {
        description:
          error instanceof Error ? error.message : 'Recarga la ficha e inténtalo de nuevo.',
      })
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface-subtle rounded-lg p-2">
      <div className="flex items-center justify-between gap-2">
        <span>
          <strong>{parameter.label}</strong> ({parameter.unit}) ·{' '}
          {parameter.min_value == null
            ? 'Sin rango'
            : `${parameter.min_value}–${parameter.max_value}`}
        </span>
        {canWrite ? (
          <Button size="sm" variant="ghost" onPress={() => setEditing(!editing)}>
            Configurar rango
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label>
            Mínimo{' '}
            <input
              className="border-input bg-background block w-24 rounded-lg border p-2"
              type="number"
              step="any"
              value={min}
              onChange={(event) => setMin(event.target.value)}
            />
          </label>
          <label>
            Máximo{' '}
            <input
              className="border-input bg-background block w-24 rounded-lg border p-2"
              type="number"
              step="any"
              value={max}
              onChange={(event) => setMax(event.target.value)}
            />
          </label>
          <Button size="sm" isDisabled={busy || !validRange} onPress={() => void save()}>
            Guardar rango
          </Button>
          <p className="text-muted-foreground basis-full text-xs">
            Vacía ambos campos para quitar el rango. Los cambios no modifican lecturas anteriores.
          </p>
        </div>
      ) : null}
    </div>
  )
}
