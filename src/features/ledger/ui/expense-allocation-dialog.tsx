import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { formatEuros, parseEuros } from '@/shared/domain/money'
import type { LedgerEntry } from '@/shared/domain/types'
import { newId } from '@/shared/store/store'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  allocateExpense,
  loadAllocationTargets,
  loadExpenseAllocations,
  loadMatchingCosts,
  reverseExpenseAllocation,
} from '../application/expense-allocation-actions'

export function ExpenseAllocationDialog({
  entry,
  onClose,
}: {
  entry: LedgerEntry | null
  onClose: () => void
}) {
  const [targetKey, setTargetKey] = useState('')
  const [amount, setAmount] = useState('')
  const [costEntryId, setCostEntryId] = useState('')
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()
  const tenantId = entry?.tenantId ?? ''
  const expenseId = entry?.id ?? ''
  const allocationQuery = useQuery({
    queryKey: ['expense-allocations', tenantId, expenseId],
    queryFn: () => loadExpenseAllocations(tenantId, expenseId),
    enabled: !!entry,
  })
  const targetQuery = useQuery({
    queryKey: ['allocation-targets', tenantId],
    queryFn: () => loadAllocationTargets(tenantId),
    enabled: !!entry,
  })
  const target = targetQuery.data?.find((item) => `${item.kind}:${item.id}` === targetKey)
  const costQuery = useQuery({
    queryKey: ['allocation-costs', tenantId, targetKey],
    queryFn: () => {
      if (!target) throw new Error('Selecciona un destino.')
      return loadMatchingCosts(tenantId, target)
    },
    enabled: !!target,
  })
  const allocated = allocationQuery.data?.reduce((sum, item) => sum + item.gross_cents, 0) ?? 0
  const remaining = (entry?.amountCents ?? 0) - allocated
  const grossCents = parseEuros(amount)

  async function submit() {
    if (!entry || !target || busy || grossCents <= 0 || grossCents > remaining) return
    setBusy(true)
    try {
      await allocateExpense({
        tenantId,
        ledgerEntryId: expenseId,
        target,
        grossCents,
        costEntryId: costEntryId || null,
        operationId: newId(),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expense-allocations', tenantId, expenseId] }),
        queryClient.invalidateQueries({ queryKey: ['work-profitability', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['contract-profitability', tenantId] }),
      ])
      setAmount('')
      setCostEntryId('')
      toast.success('Gasto imputado')
    } catch (error) {
      toast.error('No se pudo imputar el gasto', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function reverse(allocationId: string) {
    if (busy) return
    setBusy(true)
    try {
      await reverseExpenseAllocation(tenantId, allocationId, newId())
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expense-allocations', tenantId, expenseId] }),
        queryClient.invalidateQueries({ queryKey: ['work-profitability', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['contract-profitability', tenantId] }),
      ])
      toast.success('Imputación anulada')
    } catch (error) {
      toast.error('No se pudo anular la imputación', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={!!entry}
      onOpenChange={(open) => {
        if (!open) {
          setTargetKey('')
          setAmount('')
          setCostEntryId('')
          onClose()
        }
      }}
      title="Imputar gasto"
      description={entry ? `${entry.concept} · Disponible: ${formatEuros(remaining)}` : ''}
      submitLabel="Imputar"
      submitDisabled={
        busy ||
        !target ||
        grossCents <= 0 ||
        grossCents > remaining ||
        allocationQuery.isPending ||
        allocationQuery.isError ||
        targetQuery.isError
      }
      onSubmit={() => void submit()}
    >
      <SelectField
        label="Trabajo o contrato"
        value={targetKey}
        options={[
          { value: '', label: 'Seleccionar destino' },
          ...(targetQuery.data ?? []).map((item) => ({
            value: `${item.kind}:${item.id}`,
            label: `${item.kind === 'work' ? 'Trabajo' : 'Contrato'} · ${item.title}`,
          })),
        ]}
        onChange={(value) => {
          setTargetKey(value)
          setCostEntryId('')
        }}
      />
      <TextField
        label="Importe con IVA (€)"
        value={amount}
        onChange={setAmount}
        placeholder={entry ? formatEuros(remaining) : '0,00'}
        helper="Puedes imputar parte del gasto y repartir el resto después."
      />
      <SelectField
        label="Coste operativo ya registrado"
        value={costEntryId}
        options={[
          { value: '', label: 'Ninguno · sumar al coste real' },
          ...(costQuery.data ?? []).map((cost) => ({
            value: cost.id,
            label: `${cost.incurred_on} · ${cost.description} · ${formatEuros(cost.signed_total_cost_cents)}`,
          })),
        ]}
        onChange={setCostEntryId}
      />
      <p className="text-muted-foreground self-end text-xs">
        Si el mismo importe ya figura como material, horas u otro coste, vincúlalo aquí para no
        sumarlo dos veces. El importe sin IVA debe coincidir.
      </p>
      <div className="sm:col-span-2">
        {allocationQuery.isError ? <p role="alert">{allocationQuery.error.message}</p> : null}
        {targetQuery.isError ? <p role="alert">{targetQuery.error.message}</p> : null}
        {costQuery.isError ? <p role="alert">{costQuery.error.message}</p> : null}
        {allocationQuery.data?.length ? (
          <ul className="space-y-2" aria-label="Imputaciones activas">
            {allocationQuery.data.map((item) => {
              const destination = targetQuery.data?.find(
                (candidate) => candidate.id === (item.work_order_id ?? item.contract_id),
              )
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {destination?.title ?? 'Destino'} · {formatEuros(item.gross_cents)} con IVA
                    {item.work_cost_entry_id || item.contract_cost_entry_id
                      ? ' · coste ya registrado'
                      : ''}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    isDisabled={busy}
                    onPress={() => void reverse(item.id)}
                  >
                    Anular
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </FormDialog>
  )
}
