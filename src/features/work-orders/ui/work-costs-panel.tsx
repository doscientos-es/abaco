import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { formatEuros, parseEuros } from '@/shared/domain/money'
import { SelectField, TextField } from '@/shared/ui/form'

import {
  listWorkCosts,
  loadWorkCostSummary,
  loadWorkStructure,
  recordWorkCost,
  reverseWorkCost,
  type WorkCostKind,
} from '../application/work-order-actions'

const costKinds: Array<{ value: WorkCostKind; label: string; unit: string }> = [
  { value: 'labor', label: 'Horas', unit: 'h' },
  { value: 'material', label: 'Material', unit: 'ud' },
  { value: 'product', label: 'Producto', unit: 'ud' },
  { value: 'travel', label: 'Desplazamiento', unit: 'km' },
  { value: 'subcontract', label: 'Subcontrata', unit: 'ud' },
  { value: 'other', label: 'Otro', unit: 'ud' },
]

export function WorkCostsPanel({
  tenantId,
  workOrderId,
}: {
  tenantId: string
  workOrderId: string
}) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [kind, setKind] = useState<WorkCostKind>('labor')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('h')
  const [unitCost, setUnitCost] = useState('')
  const [incurredOn, setIncurredOn] = useState(new Date().toISOString().slice(0, 10))
  const [supplier, setSupplier] = useState('')
  const [taskId, setTaskId] = useState('')
  const [busy, setBusy] = useState(false)
  const operationIds = useRef(new Map<string, string>())
  const entriesKey = ['work-costs', tenantId, workOrderId, page]
  const summaryKey = ['work-cost-summary', tenantId, workOrderId]
  const entries = useQuery({
    queryKey: entriesKey,
    queryFn: () => listWorkCosts(tenantId, workOrderId, page),
  })
  const summary = useQuery({
    queryKey: summaryKey,
    queryFn: () => loadWorkCostSummary(tenantId, workOrderId),
  })
  const structure = useQuery({
    queryKey: ['work-structure', tenantId, workOrderId],
    queryFn: () => loadWorkStructure(tenantId, workOrderId),
  })

  const parsedQuantity = Number(quantity.replace(',', '.'))
  const unitCostCents = parseEuros(unitCost)
  const validQuantity =
    /^\d+(?:[.,]\d{1,3})?$/.test(quantity.trim()) &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    parsedQuantity <= 999999999.999
  const formValid =
    description.trim().length > 0 &&
    unit.trim().length > 0 &&
    validQuantity &&
    Number.isSafeInteger(unitCostCents) &&
    unitCostCents > 0 &&
    Boolean(incurredOn)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['work-costs', tenantId, workOrderId] })
    await queryClient.invalidateQueries({ queryKey: summaryKey })
    await queryClient.invalidateQueries({ queryKey: ['work-profitability', tenantId, workOrderId] })
  }

  async function addCost() {
    if (busy || !formValid) return
    const payload = {
      tenantId,
      workOrderId,
      taskId: taskId || null,
      kind,
      description: description.trim(),
      quantity: parsedQuantity,
      unit: unit.trim(),
      unitCostCents,
      incurredOn,
      supplier: supplier.trim(),
    }
    const key = `add:${JSON.stringify(payload)}`
    let operationId = operationIds.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operationIds.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await recordWorkCost({ ...payload, operationId })
      operationIds.current.delete(key)
      setDescription('')
      setUnitCost('')
      setSupplier('')
      setPage(0)
      await refresh()
      toast.success('Coste real registrado')
    } catch (error) {
      toast.error('No se pudo registrar el coste', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function reverse(entryId: string) {
    if (busy || !window.confirm('Se añadirá una anulación y se conservará el coste original.'))
      return
    const key = `reverse:${entryId}`
    let operationId = operationIds.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operationIds.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await reverseWorkCost(tenantId, entryId, operationId)
      operationIds.current.delete(key)
      await refresh()
      toast.success('Coste anulado')
    } catch (error) {
      toast.error('No se pudo anular el coste', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Costes reales</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {summary.isError ? (
          <p role="alert" className="text-destructive text-sm">
            No se pudo calcular el coste: {summary.error.message}
          </p>
        ) : (
          <p className="text-sm font-semibold">
            Total registrado: {summary.data ? formatEuros(summary.data.netCents) : 'Cargando…'}
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          Cada tarifa queda guardada con su registro. Una corrección crea una anulación visible.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Tipo de coste"
            value={kind}
            options={costKinds.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => {
              const selected = costKinds.find((option) => option.value === value)
              setKind(value as WorkCostKind)
              setUnit(selected?.unit ?? 'ud')
            }}
          />
          <SelectField
            label="Tarea relacionada"
            value={taskId}
            options={[
              { value: '', label: 'Sin tarea' },
              ...(structure.data?.tasks ?? []).map((task) => ({
                value: task.id,
                label: task.title,
              })),
            ]}
            onChange={setTaskId}
          />
          <TextField
            label="Concepto"
            value={description}
            onChange={setDescription}
            placeholder="Ejemplo: dos horas de reparación"
            maxLength={300}
            className="sm:col-span-2"
          />
          <TextField
            label="Cantidad"
            value={quantity}
            onChange={setQuantity}
            placeholder="1"
            helper="Máximo tres decimales"
          />
          <TextField
            label="Unidad"
            value={unit}
            onChange={setUnit}
            placeholder="h, ud, km…"
            maxLength={30}
          />
          <TextField
            label="Coste por unidad (€)"
            value={unitCost}
            onChange={setUnitCost}
            placeholder="0,00"
          />
          <TextField
            label="Fecha del coste"
            type="date"
            value={incurredOn}
            onChange={setIncurredOn}
            placeholder="Fecha"
          />
          <TextField
            label="Proveedor o subcontrata"
            value={supplier}
            onChange={setSupplier}
            placeholder="Opcional"
            maxLength={200}
            className="sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button isDisabled={busy || !formValid} onPress={() => void addCost()}>
              {busy ? 'Registrando…' : 'Registrar coste'}
            </Button>
          </div>
        </div>
        {entries.isError ? (
          <p role="alert" className="text-destructive text-sm">
            No se pudieron cargar los costes: {entries.error.message}
            <Button variant="outline" className="ml-2" onPress={() => void entries.refetch()}>
              Reintentar
            </Button>
          </p>
        ) : null}
        {entries.data?.entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aún no hay costes registrados.</p>
        ) : null}
        {entries.data?.entries.length ? (
          <ul className="border-border divide-y border-y text-sm">
            {entries.data.entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">
                    {entry.description}
                    {entry.reversal_of ? ' · Anulación' : ''}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {entry.incurred_on} · {entry.quantity} {entry.unit} ×{' '}
                    {formatEuros(entry.unit_cost_cents)}
                    {entry.supplier ? ` · ${entry.supplier}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <strong>{formatEuros(entry.signed_total_cost_cents)}</strong>
                  {!entry.reversal_of && !entries.data.reversedIds.includes(entry.id) ? (
                    <Button
                      variant="outline"
                      isDisabled={busy}
                      onPress={() => void reverse(entry.id)}
                    >
                      Anular
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {entries.data && entries.data.count > entries.data.pageSize ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              Página {page + 1} de {Math.ceil(entries.data.count / entries.data.pageSize)}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" isDisabled={page === 0} onPress={() => setPage(page - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                isDisabled={(page + 1) * entries.data.pageSize >= entries.data.count}
                onPress={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
