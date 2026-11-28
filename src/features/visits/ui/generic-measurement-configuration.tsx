import { Button } from '@doscientos/ui'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'

import { configureGenericVisitMeasurement } from '../application/visit-measurement-actions'

const control = 'border-border bg-background min-h-11 w-full rounded-md border px-3 text-sm'
const fields = [
  ['label', 'Nombre del parámetro', 100],
  ['unit', 'Unidad', 24],
  ['method', 'Método definido', 100],
] as const
type Config = { label: string; unit: string; method: string }
const empty: Config = { label: '', unit: '', method: '' }

export function GenericMeasurementConfiguration({
  tenantId,
  visitId,
  online,
  onConfigured,
}: {
  tenantId: string
  visitId: string
  online: boolean
  onConfigured: () => Promise<void>
}) {
  const [values, setValues] = useState(empty)
  const [confirmed, setConfirmed] = useState(false)
  const operation = useRef<{ signature: string; id: string } | null>(null)
  const sending = useRef(false)
  const create = useMutation({
    mutationFn: (input: Config & { id: string }) =>
      configureGenericVisitMeasurement(tenantId, visitId, input),
    onSuccess: async () => {
      setValues(empty)
      operation.current = null
      setConfirmed(true)
      await onConfigured()
    },
    onSettled: () => {
      sending.current = false
    },
  })
  const input = {
    label: values.label.trim(),
    unit: values.unit.trim(),
    method: values.method.trim(),
  }
  const valid = online && input.label.length >= 2 && Boolean(input.unit) && input.method.length >= 2

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || sending.current) return
    sending.current = true
    setConfirmed(false)
    const signature = JSON.stringify(input)
    const id =
      operation.current?.signature === signature ? operation.current.id : crypto.randomUUID()
    operation.current = { signature, id }
    create.mutate({ ...input, id })
  }

  return (
    <details className="border-border rounded-lg border p-3 text-sm">
      <summary className="focus-visible:outline-ring flex min-h-11 cursor-pointer items-center font-medium">
        Configurar qué medir en este activo
      </summary>
      <p className="text-muted-foreground mb-3">
        El parámetro se usará en las visitas del mismo activo. La unidad y el método quedan fijados;
        aquí no se definen umbrales.
      </p>
      <form aria-label="Configurar parámetro del activo" onSubmit={submit} className="space-y-3">
        <fieldset disabled={create.isPending} className="grid min-w-0 gap-2 sm:grid-cols-2">
          {fields.map(([key, label, limit]) => (
            <label key={key} className="min-w-0 space-y-1">
              <span className="block font-medium">{label}</span>
              <input
                className={control}
                value={values[key]}
                maxLength={limit}
                onChange={(event) => {
                  setValues({ ...values, [key]: event.target.value })
                  setConfirmed(false)
                  create.reset()
                }}
              />
            </label>
          ))}
        </fieldset>
        {!online ? <p>Conéctate para guardar la configuración.</p> : null}
        {create.isError ? (
          <p role="alert" className="text-destructive">
            {create.error.message}
          </p>
        ) : null}
        {confirmed ? <output className="block">Parámetro creado para este activo.</output> : null}
        <Button type="submit" disabled={!valid || create.isPending} className="min-h-11">
          {create.isPending
            ? 'Guardando parámetro…'
            : create.isError
              ? 'Reintentar parámetro'
              : 'Crear parámetro'}
        </Button>
      </form>
    </details>
  )
}
