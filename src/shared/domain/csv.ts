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

export type QuarterVat = {
  /** `2026-T3` */
  key: string
  year: number
  quarter: number
  /** Net sales and net purchases, VAT charged (repercutido) and paid (soportado), and what is left to pay. */
  salesBase: number
  collected: number
  purchasesBase: number
  paid: number
  toPay: number
}

/** VAT per calendar quarter (Modelo 303 figures), newest first. */
export function quarterlyVat(entries: LedgerEntry[]): QuarterVat[] {
  const quarters = new Map<string, QuarterVat>()
  for (const entry of entries) {
    const year = Number(entry.date.slice(0, 4))
    const month = Number(entry.date.slice(5, 7))
    if (!year || !month) continue
    const quarter = Math.ceil(month / 3)
    const key = `${year}-T${quarter}`
    const q = quarters.get(key) ?? {
      key,
      year,
      quarter,
      salesBase: 0,
      collected: 0,
      purchasesBase: 0,
      paid: 0,
      toPay: 0,
    }
    if (entry.kind === 'income') {
      q.salesBase += ledgerNetCents(entry)
      q.collected += ledgerVatCents(entry)
    } else {
      q.purchasesBase += ledgerNetCents(entry)
      q.paid += ledgerVatCents(entry)
    }
    q.toPay = q.collected - q.paid
    quarters.set(key, q)
  }
  return [...quarters.values()].sort((a, b) => b.key.localeCompare(a.key))
}

export function buildQuarterlyVatCsv(quarters: QuarterVat[]): string {
  const header = ['Trimestre', 'Base ventas', 'IVA repercutido', 'Base compras', 'IVA soportado', 'A ingresar']
  const rows = [...quarters]
    .reverse()
    .map((q) =>
      [
        q.key,
        centsToPlain(q.salesBase),
        centsToPlain(q.collected),
        centsToPlain(q.purchasesBase),
        centsToPlain(q.paid),
        centsToPlain(q.toPay),
      ].join(';'),
    )
  return `\uFEFF${[header.join(';'), ...rows].join('\r\n')}\r\n`
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
