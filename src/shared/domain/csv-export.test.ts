import { describe, expect, it } from 'vitest'

import { readSpreadsheet } from '../lib/read-spreadsheet'
import {
  buildClientsCsv,
  buildExpensesCsv,
  buildInvoicesCsv,
  buildLedgerCsv,
  buildPaymentsCsv,
  buildQuarterlyVatCsv,
  type ExportInvoice,
} from './csv'
import { buildTemplateCsv } from './table-import'

const invoice: ExportInvoice = {
  id: 'invoice-1',
  number: 'F-2026-001',
  issuedAt: '2026-10-25',
  dueDate: '2026-11-10',
  clientId: 'client-1',
  issuerTaxId: 'B12345678',
  clientTaxId: '12345678Z',
  sourceKind: 'milestone',
  sourceId: 'milestone-1',
  concept: 'Servicio',
  totalCents: 12100,
  vatRate: 21,
  paidCents: 3000,
  emailAcceptedAt: '2026-10-25T12:00:00Z',
}

describe('structured accounting CSV', () => {
  it('exports clients without letting spreadsheet applications evaluate user text', () => {
    const csv = buildClientsCsv([
      {
        id: 'client-1',
        name: '=HYPERLINK("https://example.test")',
        kind: 'business',
        taxId: 'B12345678',
        email: 'client@example.test',
        phone: '  +34 600 000 000',
        address: 'Calle; 1',
        billingAddress: '',
        archivedAt: '',
        notes: 'Línea uno\r\nLínea dos',
      },
    ])
    expect(csv.startsWith('\uFEFFcliente_id;')).toBe(true)
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"')
    expect(csv).toContain('"\'  +34 600 000 000"')
    expect(csv).toContain('"Calle; 1"')
    expect(csv).toContain('"Línea uno\r\nLínea dos"')
  })

  it('keeps invoiced revenue distinct from cash received', () => {
    const csv = buildInvoicesCsv([invoice])
    expect(csv).toContain('invoice-1;F-2026-001')
    expect(csv).toContain('milestone;milestone-1;Servicio;100.00;21.00;21.00;121.00;30.00;91.00;')
  })

  it('exports payment operations and expenses with stable source IDs', () => {
    const payments = buildPaymentsCsv(
      [
        {
          id: 'payment-1',
          invoiceId: invoice.id,
          ledgerEntryId: 'ledger-1',
          date: '2026-10-26',
          amountCents: -3000,
          type: 'refund',
        },
      ],
      [invoice],
    )
    expect(payments).toContain(
      'payment-1;invoice-1;F-2026-001;client-1;2026-10-26;-30.00;ledger-1;refund;;\r\n',
    )
    const expenses = buildExpensesCsv([
      {
        id: 'expense-1',
        date: '2026-10-26',
        concept: 'Material',
        category: 'Materiales',
        amountCents: 1210,
        vatRate: 21,
        estimateId: 'estimate-1',
        milestoneId: '',
      },
    ])
    expect(expenses).toContain(
      'expense-1;2026-10-26;Material;Materiales;10.00;21.00;2.10;12.10;estimate-1;',
    )
  })

  it('preserves signed amounts and trailing CRLF in the ledger and quarterly VAT files', () => {
    const ledger = buildLedgerCsv([
      {
        id: 'ledger-1',
        tenantId: 'tenant-1',
        kind: 'expense',
        date: '2026-01-02',
        concept: 'Compra',
        category: 'Materiales',
        amountCents: 1210,
        vatRate: 21,
        estimateId: null,
        milestoneId: null,
      },
    ])
    expect(ledger).toBe(
      '\uFEFFFecha;Tipo;Concepto;Categoría;Base;IVA %;Total;Contraparte;NIF;Nº documento\r\n2026-01-02;Gasto;Compra;Materiales;-10.00;21.00;-12.10;;;\r\n',
    )
    const vat = buildQuarterlyVatCsv([
      {
        key: '2026-T1',
        year: 2026,
        quarter: 1,
        salesBase: 0,
        collected: 0,
        purchasesBase: 1000,
        paid: 210,
        toPay: -210,
      },
    ])
    expect(vat).toBe(
      '\uFEFFTrimestre;Base ventas;IVA repercutido;Base compras;IVA soportado;A ingresar\r\n2026-T1;0.00;0.00;10.00;2.10;-2.10\r\n',
    )
  })

  it('reads a generated import template back without losing quotes, accents or line breaks', async () => {
    const example = 'Señal; "baño"\r\nPérez'
    const csv = buildTemplateCsv({
      singular: 'cliente',
      plural: 'clientes',
      columns: [{ label: 'Descripción', hint: 'Texto libre', example }],
      parse: (row) => ({ ok: true, value: row }),
      duplicateKeys: () => [],
    })
    expect(csv).toBe('\uFEFFDescripción\r\n"Señal; ""baño""\r\nPérez"\r\n')
    await expect(readSpreadsheet(new File([csv], 'plantilla.csv'))).resolves.toEqual([
      ['Descripción'],
      [example],
    ])
  })
})
