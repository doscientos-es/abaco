import { z } from 'zod'

import { centsToPlain } from '@/shared/domain/money'
import { writeCsv } from '@/shared/lib/write-csv'

const date = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return (
      Number(value.slice(0, 4)) >= 2000 &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  })
const text = z.string().trim().min(1)
const cents = z.number().int().min(-100_000_000_000).max(100_000_000_000)

// This is an issued fiscal snapshot, never a payment or a mutable company profile.
const invoice = z
  .object({
    number: text,
    issueDate: date,
    type: z.enum(['ordinary', 'corrective']),
    rectifiesNumber: z.string().trim().optional(),
    issuerName: text,
    issuerTaxId: text,
    recipientName: text,
    recipientTaxId: text,
    concept: text,
    netCents: cents,
    vatPercent: z.number().min(0).max(100).finite(),
    vatCents: cents,
    totalCents: cents,
  })
  .superRefine((item, ctx) => {
    if (item.netCents + item.vatCents !== item.totalCents) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Importes de factura inconsistentes' })
    }
    if (item.type === 'corrective' && !item.rectifiesNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Falta la factura rectificada' })
    }
  })

export type SubscriptionInvoiceExport = z.infer<typeof invoice>
export type Quarter = { year: number; quarter: 1 | 2 | 3 | 4; start: string; end: string }

/** Calendar dates with an exclusive end; no conversion from payment timestamps. */
export function quarterPeriod(year: number, quarter: number): Quarter {
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 9998 ||
    !Number.isInteger(quarter) ||
    quarter < 1 ||
    quarter > 4
  ) {
    throw new Error('Trimestre no válido')
  }
  const startMonth = (quarter - 1) * 3 + 1
  const endYear = quarter === 4 ? year + 1 : year
  const endMonth = quarter === 4 ? 1 : startMonth + 3
  const day = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`
  return {
    year,
    quarter: quarter as Quarter['quarter'],
    start: day(year, startMonth),
    end: day(endYear, endMonth),
  }
}

/** The last completed calendar quarter, using Spain's mainland time. */
export function lastClosedQuarter(now: Date): Quarter {
  if (!Number.isFinite(now.getTime())) throw new Error('Fecha no válida')
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const current = Math.ceil(month / 3)
  return current === 1 ? quarterPeriod(year - 1, 4) : quarterPeriod(year, current - 1)
}

/** Builds a ledger from complete, already-issued snapshots; it does not fetch invoices. */
export function subscriptionInvoicesCsv(records: unknown, period: Quarter): string {
  const expectedPeriod = quarterPeriod(period.year, period.quarter)
  if (period.start !== expectedPeriod.start || period.end !== expectedPeriod.end) {
    throw new Error('Trimestre no válido')
  }
  const invoices = z.array(invoice).parse(records)
  const numbers = new Set<string>()
  for (const item of invoices) {
    if (numbers.has(item.number)) throw new Error('Número de factura duplicado')
    numbers.add(item.number)
  }
  const rows = invoices
    .filter((item) => item.issueDate >= period.start && item.issueDate < period.end)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number))
    .map((item) => [
      item.number,
      item.issueDate,
      item.type === 'ordinary' ? 'Ordinaria' : 'Rectificativa',
      item.rectifiesNumber ?? '',
      item.issuerName,
      item.issuerTaxId,
      item.recipientName,
      item.recipientTaxId,
      item.concept,
      centsToPlain(item.netCents),
      String(item.vatPercent),
      centsToPlain(item.vatCents),
      centsToPlain(item.totalCents),
    ])
  return writeCsv(
    [
      'numero',
      'fecha_emision',
      'tipo',
      'factura_rectificada',
      'emisor',
      'nif_emisor',
      'destinatario',
      'nif_destinatario',
      'concepto',
      'base_eur',
      'iva_pct',
      'iva_eur',
      'total_eur',
    ],
    rows,
  )
}
