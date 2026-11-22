import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'

import {
  lastClosedQuarter,
  quarterPeriod,
  subscriptionInvoicesCsv,
} from './subscription-invoice-export'

const invoice = {
  number: 'AB-001',
  issueDate: '2026-07-01',
  type: 'ordinary',
  issuerName: 'Doscientos SL',
  issuerTaxId: 'B12345678',
  recipientName: 'Empresa SL',
  recipientTaxId: 'B87654321',
  concept: 'Suscripción',
  netCents: 3480,
  vatPercent: 21,
  vatCents: 731,
  totalCents: 4211,
}

describe('subscription invoices quarterly export', () => {
  it('finds the last closed quarter in Madrid, including the year and midnight boundaries', () => {
    expect(lastClosedQuarter(new Date('2026-12-31T22:59:59Z'))).toEqual(quarterPeriod(2026, 3))
    expect(lastClosedQuarter(new Date('2026-12-31T23:00:00Z'))).toEqual(quarterPeriod(2026, 4))
    expect(quarterPeriod(2026, 4)).toMatchObject({ start: '2026-10-01', end: '2027-01-01' })
    expect(() => lastClosedQuarter(new Date('invalid'))).toThrow()
    expect(() => quarterPeriod(2026, 5)).toThrow()
  })

  it('includes issued dates at the inclusive start and excludes the next quarter', () => {
    const csv = subscriptionInvoicesCsv(
      [
        { ...invoice, number: 'AB-before', issueDate: '2026-06-30' },
        { ...invoice, number: 'AB-end', issueDate: '2026-09-30' },
        { ...invoice, number: 'AB-after', issueDate: '2026-10-01' },
        invoice,
      ],
      quarterPeriod(2026, 3),
    )
    const rows = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
    }).data
    expect(rows.map((row) => row.numero)).toEqual(['AB-001', 'AB-end'])
    expect(rows[0]).toMatchObject({
      fecha_emision: '2026-07-01',
      base_eur: '34.80',
      iva_eur: '7.31',
      total_eur: '42.11',
    })
  })

  it('preserves signed corrective amounts and escapes recipient text for spreadsheets', () => {
    const csv = subscriptionInvoicesCsv(
      [
        {
          ...invoice,
          type: 'corrective',
          number: 'R-001',
          rectifiesNumber: 'AB-001',
          recipientName: '=HYPERLINK("evil")',
          concept: 'Cambio;\ncuota',
          netCents: -3480,
          vatCents: -731,
          totalCents: -4211,
        },
      ],
      quarterPeriod(2026, 3),
    )
    const [row] = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
    }).data
    expect(row).toMatchObject({
      tipo: 'Rectificativa',
      factura_rectificada: 'AB-001',
      destinatario: '\'=HYPERLINK("evil")',
      concepto: 'Cambio;\ncuota',
      base_eur: '-34.80',
      total_eur: '-42.11',
    })
  })

  it('exports headers for an empty period', () => {
    const csv = subscriptionInvoicesCsv([], quarterPeriod(2026, 1))
    expect(csv).toContain('numero;fecha_emision;tipo;')
    expect(csv).toContain('base_eur;iva_pct;iva_eur;total_eur')
  })

  it.each([
    { ...invoice, number: '' },
    { ...invoice, issueDate: '2026-02-30' },
    { ...invoice, issueDate: '2026-07-01T00:00:00Z' },
    { ...invoice, recipientTaxId: '' },
    { ...invoice, vatCents: 730 },
    { ...invoice, type: 'corrective' },
    { ...invoice, totalCents: Infinity },
  ])('rejects an incomplete or inconsistent issued snapshot', (item) => {
    expect(() => subscriptionInvoicesCsv([item], quarterPeriod(2026, 3))).toThrow()
  })

  it('rejects duplicate numbers and forged quarter bounds', () => {
    expect(() => subscriptionInvoicesCsv([invoice, invoice], quarterPeriod(2026, 3))).toThrow()
    expect(() =>
      subscriptionInvoicesCsv([invoice], { ...quarterPeriod(2026, 3), end: '2027-01-01' }),
    ).toThrow()
  })
})
