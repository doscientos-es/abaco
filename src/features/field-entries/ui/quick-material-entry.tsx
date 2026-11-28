import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { listVisitMaterialChoices } from '../application/field-entry-actions'
import type { PendingFieldEntry } from '../application/field-entry-queue'
import { moveMaterialQuantity, readMaterialQuantity } from '../domain/material-quantity'

const inputClasses =
  'border-input bg-background mt-1 min-h-11 w-full min-w-0 rounded-lg border px-3 py-2'

export function QuickMaterialEntry({
  tenantId,
  visitId,
  userId,
  expanded,
  busy,
  saveMaterial,
}: {
  tenantId: string
  visitId: string
  userId: string
  expanded: boolean
  busy: boolean
  saveMaterial: (material: PendingFieldEntry) => Promise<boolean>
}) {
  const [typedSearch, setTypedSearch] = useState('')
  const [search, setSearch] = useState('')
  const [choice, setChoice] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('ud')
  const [quantity, setQuantity] = useState('1')
  const [flag, setFlag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quantityHintId = useId()
  const statusId = useId()
  const choices = useQuery({
    queryKey: ['visit-material-choices', userId, tenantId, visitId, search],
    queryFn: () => listVisitMaterialChoices(tenantId, visitId, search),
    enabled: expanded,
    staleTime: 2 * 60_000,
  })

  if (!expanded) return null
  const minus = moveMaterialQuantity(quantity, -1)
  const plus = moveMaterialQuantity(quantity, 1)
  const upToDateOptions = choices.data ?? []

  function choose(id: string) {
    setChoice(id)
    const item = upToDateOptions.find((choice) => choice.id === id)
    if (!item) return
    setDescription(item.name)
    setUnit(item.unit)
    setError(null)
  }

  async function submit() {
    if (busy) return
    const amount = readMaterialQuantity(quantity)
    if (!description.trim() || amount === null || !unit.trim()) {
      setError(
        'Indica el material, la unidad y una cantidad mayor que cero, con hasta 3 decimales.',
      )
      return
    }
    setError(null)
    const accepted = await saveMaterial({
      operationId: crypto.randomUUID(),
      kind: 'material',
      description: description.trim(),
      quantity: amount,
      unit: unit.trim(),
      occurredAt: new Date().toISOString(),
      supersedesId: null,
      officeReviewRequested: flag,
    })
    if (!accepted) return
    setDescription('')
    setChoice('')
    setQuantity('1')
    setUnit('ud')
    setFlag(false)
  }

  return (
    <section aria-label="Material rápido" className="border-border space-y-3 rounded-lg border p-3">
      <p className="text-muted-foreground text-sm">
        Elige un material del catálogo o escribe su nombre. No cambia el stock ni genera cargos.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setSearch(typedSearch.trim())
        }}
      >
        <label className="min-w-0 flex-1 basis-40 text-sm">
          Buscar en catálogo
          <input
            type="search"
            className={inputClasses}
            value={typedSearch}
            maxLength={80}
            onChange={(event) => setTypedSearch(event.target.value)}
          />
        </label>
        <Button type="submit" variant="outline" className="min-h-11">
          Buscar
        </Button>
      </form>
      {choices.isPaused && !upToDateOptions.length ? (
        <p className="text-muted-foreground text-sm">
          El catálogo no se puede consultar sin conexión. Puedes escribir el material abajo.
        </p>
      ) : null}
      {choices.isFetching ? (
        <output className="text-muted-foreground block text-sm">Buscando materiales…</output>
      ) : null}
      {choices.isError ? (
        <div className="space-y-1">
          <p role="alert" className="text-muted-foreground text-sm">
            No se pudo abrir el catálogo. Puedes escribir el material abajo.
          </p>
          <Button variant="ghost" size="sm" onPress={() => void choices.refetch()}>
            Reintentar catálogo
          </Button>
        </div>
      ) : null}
      {choices.isSuccess && !upToDateOptions.length ? (
        <p className="text-muted-foreground text-sm">
          {search ? 'No hay materiales con ese nombre.' : 'El catálogo aún no tiene materiales.'}
        </p>
      ) : null}
      {upToDateOptions.length ? (
        <label className="block min-w-0 text-sm">
          Material habitual
          <select
            className={inputClasses}
            value={upToDateOptions.some((item) => item.id === choice) ? choice : ''}
            onChange={(event) => choose(event.target.value)}
            disabled={busy}
          >
            <option value="">Elige un material</option>
            {upToDateOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.unit}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <form
        className="grid min-w-0 gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="min-w-0 text-sm sm:col-span-2">
          Nombre del material
          <input
            className={inputClasses}
            value={description}
            maxLength={160}
            disabled={busy}
            onChange={(event) => {
              setChoice('')
              setDescription(event.target.value)
            }}
            placeholder="Ej. Junta de 20 mm"
          />
        </label>
        <fieldset className="min-w-0">
          <legend className="text-sm">Ajuste de cantidad</legend>
          <div className="mt-1 flex min-w-0 items-stretch gap-1.5">
            <Button
              type="button"
              variant="outline"
              aria-label="Restar una unidad"
              className="min-h-11 min-w-11 shrink-0"
              onPress={() => setQuantity(minus)}
              isDisabled={busy || minus === quantity}
            >
              −
            </Button>
            <input
              value={quantity}
              aria-label="Cantidad de material"
              aria-describedby={error ? statusId : quantityHintId}
              aria-invalid={Boolean(error && readMaterialQuantity(quantity) === null)}
              disabled={busy}
              inputMode="decimal"
              maxLength={13}
              className="border-input bg-background min-w-0 flex-1 rounded-lg border px-2 text-center"
              onChange={(event) => setQuantity(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              aria-label="Sumar una unidad"
              className="min-h-11 min-w-11 shrink-0"
              onPress={() => setQuantity(plus)}
              isDisabled={busy || plus === quantity}
            >
              +
            </Button>
          </div>
          <p id={quantityHintId} className="text-muted-foreground mt-1 text-xs">
            Hasta tres decimales.
          </p>
        </fieldset>
        <label className="min-w-0 text-sm">
          Unidad del material
          <input
            className={inputClasses}
            value={unit}
            maxLength={30}
            disabled={busy}
            onChange={(event) => setUnit(event.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            checked={flag}
            disabled={busy}
            onChange={(event) => setFlag(event.target.checked)}
          />
          <span>
            Marcar para revisión de oficina
            <span className="text-muted-foreground block">
              La marca es interna y no factura el material.
            </span>
          </span>
        </label>
        {error ? (
          <p id={statusId} role="alert" className="text-destructive text-sm sm:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" className="min-h-11" isDisabled={busy}>
            {busy ? 'Registrando…' : 'Registrar material'}
          </Button>
        </div>
      </form>
    </section>
  )
}
