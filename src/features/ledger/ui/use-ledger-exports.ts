import { toast } from '@doscientos/ui'
import { useRef, useState } from 'react'

import {
  buildClientsCsv,
  buildExpensesCsv,
  buildInvoicesCsv,
  buildLedgerCsv,
  buildPaymentsCsv,
  buildQuarterlyVatCsv,
  downloadTextFile,
  type QuarterVat,
} from '@/shared/domain/csv'
import type { LedgerEntry } from '@/shared/domain/types'

import { loadAccountingExport } from '../application/accounting-export-actions'
import type { AccountingDataset, LedgerExport } from '../domain/ledger-summary-layout'

export type LedgerExportAction = { run: () => void; disabled: boolean }

export function useLedgerExports({
  tenant,
  canExportDatasets,
  period,
  entries,
  quarters,
}: {
  tenant: { id: string; name: string }
  canExportDatasets: boolean
  period: string
  entries: LedgerEntry[]
  quarters: QuarterVat[]
}) {
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const bookSlug = tenant.name.toLowerCase().replace(/\W+/g, '-')

  async function exportDataset(dataset: AccountingDataset) {
    if (inFlight.current || !canExportDatasets) return
    inFlight.current = true
    setBusy(true)
    try {
      const data = await loadAccountingExport(tenant.id, dataset)
      const buildCsv = {
        clients: () => buildClientsCsv(data.clients),
        invoices: () => buildInvoicesCsv(data.invoices),
        payments: () => buildPaymentsCsv(data.payments, data.invoices),
        expenses: () => buildExpensesCsv(data.expenses),
      }[dataset]
      const slug = tenant.name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      const date = new Date().toISOString().slice(0, 10)
      downloadTextFile(`abaco-${slug || tenant.id}-${dataset}-${date}.csv`, buildCsv())
      toast.success('CSV preparado con todos los registros autorizados')
    } catch (error) {
      toast.error('No se pudo exportar el CSV', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function downloadBook(rows: LedgerEntry[], period: string) {
    if (rows.length) downloadTextFile(`libro-${bookSlug}-${period}.csv`, buildLedgerCsv(rows))
  }

  function exportAction(id: LedgerExport): LedgerExportAction {
    if (id === 'book')
      return {
        disabled: entries.length === 0,
        run: () => downloadBook(entries, period || 'todo'),
      }
    if (id === 'vat')
      return {
        disabled: quarters.length === 0,
        run: () => {
          if (quarters.length)
            downloadTextFile(`iva-trimestral-${bookSlug}.csv`, buildQuarterlyVatCsv(quarters))
        },
      }
    return { disabled: busy || !canExportDatasets, run: () => void exportDataset(id) }
  }

  return { exportAction, downloadBook }
}
