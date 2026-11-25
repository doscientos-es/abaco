import { describe, expect, it } from 'vitest'

import { buildExpensesCsv, buildLedgerCsv, quarterlyVat } from './csv'
import { ledgerNetCents, ledgerVatCents } from './estimate'
import { parseLedgerVatBreakdown } from './ledger-vat'
import type { LedgerEntry } from './types'

const vatBreakdown = [
  { rate: 21, baseCents: 10000, vatCents: 2100 },
  { rate: 10, baseCents: 10000, vatCents: 1000 },
]
const entry: LedgerEntry = {
  id: 'entry',
  tenantId: 'tenant',
  kind: 'expense',
  date: '2026-02-01',
  concept: 'Factura',
  category: 'Material',
  amountCents: 23100,
  vatRate: 21,
  estimateId: null,
  milestoneId: null,
  vatBreakdown,
  counterpartyName: 'Proveedor',
  counterpartyTaxId: 'B123',
  documentNumber: 'F-42',
}

describe('ledger VAT breakdown', () => {
  it('requires complete amounts and an exact match with the gross total', () => {
    const first = { rate: '21', base: '100,00', vat: '21,00' }
    const input = [first, { rate: '10', base: '100,00', vat: '10,00' }]
    expect(parseLedgerVatBreakdown(input, 23100)).toEqual(vatBreakdown)
    expect(parseLedgerVatBreakdown(input, 23099)).toBeNull()
    expect(parseLedgerVatBreakdown([{ ...first, vat: '' }], 12100)).toBeNull()
    expect(parseLedgerVatBreakdown([{ ...first, rate: '101' }], 12100)).toBeNull()
  })

  it('uses actual tax amounts in summaries and preserves legacy and refund calculations', () => {
    expect(ledgerNetCents(entry)).toBe(20000)
    expect(ledgerVatCents(entry)).toBe(3100)
    expect(quarterlyVat([entry])[0]).toMatchObject({ purchasesBase: 20000, paid: 3100 })
    expect(ledgerVatCents({ ...entry, kind: 'income', amountCents: -23100 })).toBe(-3100)
    const { vatBreakdown: _, ...legacy } = entry
    expect(ledgerVatCents({ ...legacy, amountCents: 12100 })).toBe(2100)
  })

  it('exports each tax rate with its actual base, quota and document details', () => {
    const book = buildLedgerCsv([entry])
    expect(book).toContain('-100.00;21.00;-121.00;Proveedor;B123;F-42')
    expect(book).toContain('-100.00;10.00;-110.00;Proveedor;B123;F-42')
    const expenses = buildExpensesCsv([{ ...entry, estimateId: '', milestoneId: '' }])
    expect(expenses).toContain('100.00;21.00;21.00;121.00')
    expect(expenses).toContain('100.00;10.00;10.00;110.00')
    expect(expenses).toContain('Proveedor;B123;F-42')
  })
})
