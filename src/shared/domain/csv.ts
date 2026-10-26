import { ledgerNetCents, ledgerVatCents } from './estimate'
import { centsToPlain } from './money'
import type { LedgerEntry } from './types'

function escapeField(value: string): string {
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function structuredCsv(headers: string[], rows: string[][]): string {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeField).join(';')).join('\r\n')}\r\n`
}

export type ExportClient = {
  id: string
  name: string
  kind: string
  taxId: string
  email: string
  phone: string
  address: string
  billingAddress: string
  archivedAt: string
  notes: string
}

export type ExportInvoice = {
  id: string
  number: string
  issuedAt: string
  dueDate: string
  clientId: string
  issuerTaxId: string
  clientTaxId: string
  sourceKind: 'milestone' | 'work_extra' | 'contract_period'
  sourceId: string
  concept: string
  totalCents: number
  vatRate: number
  paidCents: number
  emailAcceptedAt: string
}

export type ExportPayment = {
  id: string
  invoiceId: string
  ledgerEntryId: string
  date: string
  amountCents: number
  type?: 'payment' | 'refund'
  method?: string
  reason?: string
}

export type ExportExpense = {
  id: string
  date: string
  concept: string
  category: string
  amountCents: number
  vatRate: number
  estimateId: string
  milestoneId: string
}

const netFromGross = (grossCents: number, vatRate: number) =>
  Math.round(grossCents / (1 + vatRate / 100))

export function buildClientsCsv(clients: ExportClient[]): string {
  return structuredCsv(
    [
      'cliente_id',
      'nombre',
      'tipo',
      'nif',
      'email',
      'telefono',
      'direccion',
      'direccion_facturacion',
      'archivado_en',
      'notas',
    ],
    clients.map((client) => [
      client.id,
      client.name,
      client.kind,
      client.taxId,
      client.email,
      client.phone,
      client.address,
      client.billingAddress,
      client.archivedAt,
      client.notes,
    ]),
  )
}

export function buildInvoicesCsv(invoices: ExportInvoice[]): string {
  return structuredCsv(
    [
      'factura_id',
      'numero',
      'emitida_el',
      'vence_el',
      'cliente_id',
      'nif_emisor',
      'nif_cliente',
      'origen_tipo',
      'origen_id',
      'concepto',
      'base_eur',
      'iva_pct',
      'iva_eur',
      'total_eur',
      'cobrado_eur',
      'saldo_eur',
      'email_aceptado_el',
    ],
    invoices.map((invoice) => {
      const net = netFromGross(invoice.totalCents, invoice.vatRate)
      return [
        invoice.id,
        invoice.number,
        invoice.issuedAt,
        invoice.dueDate,
        invoice.clientId,
        invoice.issuerTaxId,
        invoice.clientTaxId,
        invoice.sourceKind,
        invoice.sourceId,
        invoice.concept,
        centsToPlain(net),
        invoice.vatRate.toFixed(2),
        centsToPlain(invoice.totalCents - net),
        centsToPlain(invoice.totalCents),
        centsToPlain(invoice.paidCents),
        centsToPlain(Math.max(0, invoice.totalCents - invoice.paidCents)),
        invoice.emailAcceptedAt,
      ]
    }),
  )
}

export function buildPaymentsCsv(payments: ExportPayment[], invoices: ExportInvoice[]): string {
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  return structuredCsv(
    [
      'movimiento_id',
      'factura_id',
      'numero_factura',
      'cliente_id',
      'fecha',
      'importe_eur',
      'asiento_id',
      'tipo',
      'metodo',
      'motivo',
    ],
    payments.map((payment) => [
      payment.id,
      payment.invoiceId,
      byId.get(payment.invoiceId)?.number ?? '',
      byId.get(payment.invoiceId)?.clientId ?? '',
      payment.date,
      centsToPlain(payment.amountCents),
      payment.ledgerEntryId,
      payment.type ?? 'payment',
      payment.method ?? '',
      payment.reason ?? '',
    ]),
  )
}

export function buildExpensesCsv(expenses: ExportExpense[]): string {
  return structuredCsv(
    [
      'gasto_id',
      'fecha',
      'concepto',
      'categoria',
      'base_eur',
      'iva_pct',
      'iva_eur',
      'total_eur',
      'presupuesto_id',
      'hito_id',
    ],
    expenses.map((expense) => {
      const net = netFromGross(expense.amountCents, expense.vatRate)
      return [
        expense.id,
        expense.date,
        expense.concept,
        expense.category,
        centsToPlain(net),
        expense.vatRate.toFixed(2),
        centsToPlain(expense.amountCents - net),
        centsToPlain(expense.amountCents),
        expense.estimateId,
        expense.milestoneId,
      ]
    }),
  )
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
        entry.kind === 'income' ? (entry.amountCents < 0 ? 'Reembolso' : 'Ingreso') : 'Gasto',
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
  const header = [
    'Trimestre',
    'Base ventas',
    'IVA repercutido',
    'Base compras',
    'IVA soportado',
    'A ingresar',
  ]
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
