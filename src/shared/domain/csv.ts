import { ledgerNetCents, ledgerVatCents } from './estimate'
import { centsToPlain } from './money'
import type { LedgerEntry } from './types'

function escapeField(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Semicolon-separated with BOM so Spanish Excel and gestorías open it directly. */
export function buildLedgerCsv(entries: LedgerEntry[]): string {
  const header = ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Base', 'IVA %', 'Total']
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => {
      const sign = entry.kind === 'expense' ? -1 : 1
      return [
        entry.date,
        entry.kind === 'income' ? 'Ingreso' : 'Gasto',
        escapeField(entry.concept),
        escapeField(entry.category),
        centsToPlain(sign * ledgerNetCents(entry)),
        entry.vatRate.toFixed(2),
        centsToPlain(sign * entry.amountCents),
      ].join(';')
    })
  return `\uFEFF${[header.join(';'), ...rows].join('\r\n')}\r\n`
}

export function ledgerVatSummary(entries: LedgerEntry[]): { collected: number; paid: number } {
  let collected = 0
  let paid = 0
  for (const entry of entries) {
    if (entry.kind === 'income') collected += ledgerVatCents(entry)
    else paid += ledgerVatCents(entry)
  }
  return { collected, paid }
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
