import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { formatEuros, parseEuros } from '@/shared/domain/money'
import { SelectField, TextField } from '@/shared/ui/form'

import type { ContractVisit } from '../application/contract-actions'
import {
  listContractCosts,
  loadContractCostSummary,
  recordContractCost,
  reverseContractCost,
  type ContractCostKind,
} from '../application/contract-cost-actions'

const kinds: Array<{ value: ContractCostKind; label: string; unit: string }> = [
  { value: 'labor', label: 'Horas', unit: 'h' },
  { value: 'material', label: 'Material', unit: 'ud' },
  { value: 'product', label: 'Producto', unit: 'ud' },
  { value: 'travel', label: 'Desplazamiento', unit: 'km' },
  { value: 'subcontract', label: 'Subcontrata', unit: 'ud' },
  { value: 'other', label: 'Otro', unit: 'ud' },
]

export function ContractCostsPanel({
  tenantId,
  contractId,
  visits,
}: {
  tenantId: string
  contractId: string
  visits: ContractVisit[]
}) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [kind, setKind] = useState<ContractCostKind>('labor')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('h')
  const [unitCost, setUnitCost] = useState('')
  const [incurredOn, setIncurredOn] = useState(new Date().toISOString().slice(0, 10))
  const [supplier, setSupplier] = useState('')
  const [visitId, setVisitId] = useState('')
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())
  const listKey = ['contract-costs', tenantId, contractId]
  const summaryKey = ['contract-cost-summary', tenantId, contractId]
  const list = useQuery({
    queryKey: [...listKey, page],
    queryFn: () => listContractCosts(tenantId, contractId, page),
  })
  const summary = useQuery({
    queryKey: summaryKey,
    queryFn: () => loadContractCostSummary(tenantId, contractId),
  })
  const parsedQuantity = Number(quantity.replace(',', '.'))
  const unitCostCents = parseEuros(unitCost)
  const valid =
    description.trim().length > 0 &&
    /^\d+(?:[.,]\d{1,3})?$/.test(quantity.trim()) &&
    parsedQuantity > 0 &&
    parsedQuantity <= 999999999.999 &&
    unit.trim().length > 0 &&
    Number.isSafeInteger(unitCostCents) &&
    unitCostCents > 0 &&
    Math.round(parsedQuantity * unitCostCents) <= 9000000000000000 &&
    Boolean(incurredOn)

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: summaryKey }),
      queryClient.invalidateQueries({ queryKey: ['contract-profitability', tenantId, contractId] }),
    ])
  }

  async function add() {
    if (busy || !valid) return
    const payload = {
      tenantId,
      contractId,
      visitId: visitId || null,
      kind,
      description: description.trim(),
      quantity: parsedQuantity,
      unit: unit.trim(),
      unitCostCents,
      incurredOn,
      supplier: supplier.trim(),
    }
    const key = `add:${JSON.stringify(payload)}`
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await recordContractCost({ ...payload, operationId })
      operations.current.delete(key)
      setDescription('')
      setQuantity('1')
      setUnitCost('')
      setVisitId('')
      setPage(0)
      await refresh()
      toast.success('Coste registrado')
    } catch (error) {
      toast.error('No se pudo registrar el coste', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function reverse(entryId: string) {
    if (busy) return
    const key = `reverse:${entryId}`
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await reverseContractCost(tenantId, entryId, operationId)
      operations.current.delete(key)
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
        <CardTitle>Costes reales del contrato</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {summary.isPending ? <output>Cargando costes…</output> : null}
        {summary.isError ? <p role="alert">{summary.error.message}</p> : null}
        {summary.data ? (
          <p className="font-semibold">
            {summary.data.activeCount ? formatEuros(summary.data.netCents) : 'Coste no informado'}
            {' · '}
            {summary.data.activeCount} registros activos
          </p>
        ) : null}
        <p className="text-muted-foreground">
          La tarifa aplicada queda guardada en cada registro. Los costes no cargados y los gastos
          generales sin imputación no se consideran cero; el margen contractual aún no es
          calculable.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Tipo"
            value={kind}
            options={kinds.map(({ value, label }) => ({ value, label }))}
            onChange={(value) => {
              const selected = kinds.find((item) => item.value === value)
              if (selected) {
                setKind(selected.value)
                setUnit(selected.unit)
              }
            }}
          />
          <SelectField
            label="Visita"
            value={visitId}
            options={[
              { value: '', label: 'Coste general del contrato' },
              ...visits.map((visit) => ({
                value: visit.id,
                label: `${visit.contract_occurrence_on} · ${visit.title}`,
              })),
            ]}
            onChange={setVisitId}
          />
          <TextField
            label="Descripción"
            value={description}
            onChange={setDescription}
            placeholder="Trabajo o consumo realizado"
            maxLength={300}
          />
          <TextField label="Cantidad" value={quantity} onChange={setQuantity} placeholder="1" />
          <TextField
            label="Unidad"
            value={unit}
            onChange={setUnit}
            placeholder="h"
            maxLength={30}
          />
          <TextField
            label="Coste unitario, €"
            value={unitCost}
            onChange={setUnitCost}
            placeholder="25,00"
          />
          <TextField
            label="Fecha del coste"
            type="date"
            value={incurredOn}
            onChange={setIncurredOn}
            placeholder="Fecha"
          />
          <TextField
            label="Proveedor"
            value={supplier}
            onChange={setSupplier}
            placeholder="Opcional"
            maxLength={200}
          />
        </div>
        <Button onPress={() => void add()} isDisabled={busy || !valid}>
          Registrar coste
        </Button>
        {list.isError ? <p role="alert">{list.error.message}</p> : null}
        {list.isPending ? <output>Cargando movimientos…</output> : null}
        {list.data ? (
          <>
            <ul className="divide-y rounded-lg border">
              {list.data.entries.map((entry) => {
                const reversed = list.data.reversedIds.includes(entry.id)
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <span>
                      {entry.incurred_on} · {entry.description} · {entry.quantity} {entry.unit} ×{' '}
                      {formatEuros(entry.unit_cost_cents)}
                      {entry.reversal_of ? ' · anulación' : reversed ? ' · anulado' : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      <strong>{formatEuros(entry.signed_total_cost_cents)}</strong>
                      {!entry.reversal_of && !reversed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onPress={() => void reverse(entry.id)}
                          isDisabled={busy}
                        >
                          Anular
                        </Button>
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onPress={() => setPage(page - 1)}
                isDisabled={page === 0}
              >
                Anterior
              </Button>
              <span>Página {page + 1}</span>
              <Button
                variant="outline"
                size="sm"
                onPress={() => setPage(page + 1)}
                isDisabled={(page + 1) * list.data.pageSize >= list.data.count}
              >
                Siguiente
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
