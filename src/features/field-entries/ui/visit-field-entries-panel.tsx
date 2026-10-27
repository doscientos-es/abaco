import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  listVisitFieldEntries,
  recordVisitFieldEntry,
  type FieldEntry,
  type FieldEntryKind,
} from '../application/field-entry-actions'
import {
  fieldEntryQueueKey,
  readFieldEntryQueue,
  writeFieldEntryQueue,
  type PendingFieldEntry,
} from '../application/field-entry-queue'

const kinds: { value: FieldEntryKind; label: string; unit: string }[] = [
  { value: 'labor', label: 'Tiempo de trabajo', unit: 'min' },
  { value: 'travel', label: 'Desplazamiento', unit: 'km' },
  { value: 'material', label: 'Material', unit: 'ud' },
  { value: 'spare', label: 'Repuesto', unit: 'ud' },
  { value: 'product', label: 'Producto', unit: 'L' },
  { value: 'corrective_action', label: 'Acción correctora', unit: 'ud' },
]

function labelFor(kind: FieldEntryKind) {
  return kinds.find((item) => item.value === kind)?.label ?? kind
}

function localDateTime(iso: string) {
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19)
}

export function VisitFieldEntriesPanel({
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
  const [page, setPage] = useState(0)
  const queryKey = ['visit-field-entries', tenantId, visitId, page]
  const entries = useQuery({
    queryKey,
    queryFn: () => listVisitFieldEntries(tenantId, visitId, page),
  })
  const queueKey = fieldEntryQueueKey(userId, tenantId, visitId)
  const [queue, setQueue] = useState(() => readFieldEntryQueue(queueKey))
  const [kind, setKind] = useState<FieldEntryKind>('labor')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('min')
  const [occurredAt, setOccurredAt] = useState(() => localDateTime(new Date().toISOString()))
  const [supersedesId, setSupersedesId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [storageFailed, setStorageFailed] = useState(false)
  const supersededIds = new Set(entries.data?.supersededIds ?? [])

  function chooseKind(next: FieldEntryKind) {
    setKind(next)
    setUnit(kinds.find((item) => item.value === next)?.unit ?? 'ud')
    setQuantity(next === 'corrective_action' ? '1' : '')
    setSupersedesId(null)
  }

  async function send(item: PendingFieldEntry) {
    await recordVisitFieldEntry({
      tenantId,
      visitId,
      kind: item.kind,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      occurredAt: item.occurredAt,
      supersedesId: item.supersedesId,
      operationId: item.operationId,
    })
    const next = readFieldEntryQueue(queueKey).filter(
      (pending) => pending.operationId !== item.operationId,
    )
    setStorageFailed(!writeFieldEntryQueue(queueKey, next))
    setQueue(next)
    await queryClient.invalidateQueries({ queryKey: ['visit-field-entries', tenantId, visitId] })
    setPage(0)
  }

  async function submit() {
    const amount = Number(quantity)
    const occurredDate = new Date(occurredAt)
    if (
      closed ||
      busy ||
      !description.trim() ||
      !unit.trim() ||
      !quantity.trim() ||
      !Number.isFinite(occurredDate.getTime()) ||
      occurredDate.getTime() > new Date().getTime() + 5 * 60_000 ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 999999999.999 ||
      Number(amount.toFixed(3)) !== amount ||
      (['labor', 'travel'].includes(kind) && amount > 1440) ||
      unit.trim().length > 30
    )
      return toast.error('Revisa la cantidad y la unidad antes de registrar la actividad')
    const item: PendingFieldEntry = {
      operationId: crypto.randomUUID(),
      kind,
      description: description.trim(),
      quantity: amount,
      unit: unit.trim(),
      occurredAt: occurredDate.toISOString(),
      supersedesId,
    }
    const next = [...queue, item]
    if (!writeFieldEntryQueue(queueKey, next)) {
      setStorageFailed(true)
      toast.error('No se pudo conservar la actividad en este dispositivo')
      return
    }
    setQueue(next)
    setBusy(true)
    try {
      await send(item)
      setDescription('')
      setQuantity(kind === 'corrective_action' ? '1' : '')
      setOccurredAt(localDateTime(new Date().toISOString()))
      setSupersedesId(null)
      toast.success('Actividad registrada')
    } catch (error) {
      toast.error('Actividad pendiente de envío', {
        description:
          error instanceof Error ? error.message : 'Reintenta cuando vuelva la conexión.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function retry(item: PendingFieldEntry) {
    if (busy) return
    setBusy(true)
    try {
      await send(item)
      toast.success('Actividad registrada')
    } catch (error) {
      toast.error('No se pudo enviar la actividad', {
        description: error instanceof Error ? error.message : 'Reintenta más tarde.',
      })
    } finally {
      setBusy(false)
    }
  }

  function correct(entry: FieldEntry) {
    setKind(entry.kind)
    setDescription(entry.description)
    setQuantity(String(entry.quantity))
    setUnit(entry.unit)
    setOccurredAt(localDateTime(entry.occurred_at))
    setSupersedesId(entry.id)
  }

  function discard(item: PendingFieldEntry) {
    if (!window.confirm('¿Descartar esta actividad pendiente? No se enviará a la empresa.')) return
    const next = queue.filter((pending) => pending.operationId !== item.operationId)
    if (!writeFieldEntryQueue(queueKey, next)) {
      setStorageFailed(true)
      toast.error('No se pudo descartar la actividad del dispositivo')
      return
    }
    setQueue(next)
  }

  return (
    <section className="border-border space-y-3 border-t pt-4" aria-label="Actividad de campo">
      <h3 className="font-semibold">Tiempo, desplazamientos y consumos</h3>
      {entries.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudo cargar la actividad de la visita.
        </p>
      ) : null}
      {!closed ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Tipo
            <select
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              value={kind}
              onChange={(event) => chooseKind(event.target.value as FieldEntryKind)}
            >
              {kinds.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Descripción
            <input
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              value={description}
              maxLength={300}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Qué se hizo o utilizó"
            />
          </label>
          <label className="text-sm">
            Cantidad
            <input
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              disabled={kind === 'corrective_action'}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Unidad
            {kind === 'labor' || kind === 'corrective_action' ? (
              <input
                className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                value={unit}
                readOnly
              />
            ) : kind === 'travel' ? (
              <select
                className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              >
                <option value="km">km</option>
                <option value="min">min</option>
              </select>
            ) : (
              <input
                className="border-input bg-background mt-1 w-full rounded-lg border p-2"
                value={unit}
                maxLength={30}
                onChange={(event) => setUnit(event.target.value)}
              />
            )}
          </label>
          <label className="text-sm sm:col-span-2">
            Fecha y hora de la actividad
            <input
              className="border-input bg-background mt-1 w-full rounded-lg border p-2"
              type="datetime-local"
              step="1"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </label>
          <div className="sm:col-span-2">
            {supersedesId ? (
              <p className="text-warning text-sm">
                La corrección conservará la actividad original en el historial.
              </p>
            ) : null}
            <Button
              isDisabled={busy || !description.trim() || !quantity.trim() || !unit.trim()}
              onPress={() => void submit()}
            >
              {busy ? 'Enviando…' : supersedesId ? 'Registrar corrección' : 'Registrar actividad'}
            </Button>
            {supersedesId ? (
              <Button
                variant="ghost"
                onPress={() => {
                  setSupersedesId(null)
                  setDescription('')
                  setQuantity('')
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
          <p className="font-medium">Actividad pendiente en este dispositivo</p>
          <ul className="mt-2 space-y-2">
            {queue.map((item) => (
              <li key={item.operationId} className="flex flex-wrap items-center gap-2">
                <span>
                  {labelFor(item.kind)}: {item.quantity} {item.unit} · {item.description}
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
      {!entries.data?.entries.length ? (
        <p className="text-muted-foreground text-sm">Aún no hay actividades registradas.</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {entries.data.entries.map((entry) => (
            <li key={entry.id} className="bg-surface-subtle rounded-lg p-2">
              <p>
                <strong>{labelFor(entry.kind)}</strong> · {entry.description} · {entry.quantity}{' '}
                {entry.unit}
              </p>
              <p className="text-muted-foreground">
                {new Date(entry.occurred_at).toLocaleString('es-ES')} ·{' '}
                {entry.work_order_id
                  ? 'Trabajo'
                  : entry.contract_id
                    ? 'Contrato'
                    : 'Visita independiente'}
                {entry.supersedes_id ? ' · Corrección' : ''}
                {supersededIds.has(entry.id) ? ' · Corregida' : ''}
              </p>
              {!closed && !supersededIds.has(entry.id) ? (
                <Button size="sm" variant="ghost" onPress={() => correct(entry)}>
                  Corregir
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {(entries.data?.count ?? 0) > 0 ? (
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
            {Math.ceil((entries.data?.count ?? 0) / (entries.data?.pageSize ?? 25))}
          </span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={(page + 1) * (entries.data?.pageSize ?? 25) >= (entries.data?.count ?? 0)}
            onPress={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </section>
  )
}
