import { describe, expect, it } from 'vitest'

import { buildEstimateDraft, newEstimateError } from '@/features/estimates/domain/new-estimate'
import type { Tenant } from '@/shared/domain/types'

import {
  appendEstimateSuggestion,
  applyReceiptSuggestion,
  estimateSuggestionSchema,
  receiptSuggestionSchema,
  resetReceiptAutofill,
} from './suggestions'

let sequence = 0
const id = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
const unknownFiscal = {
  issuerName: null,
  issuerTaxId: null,
  recipientName: null,
  recipientTaxId: null,
  documentNumber: null,
  vatLines: null,
}
const blankFields = {
  counterpartyName: '',
  counterpartyTaxId: '',
  documentNumber: '',
  vatLines: [],
}
const tenant: Tenant = {
  id: 'tenant',
  name: 'Empresa',
  taxId: '',
  phone: '',
  email: '',
  nextEstimateNumber: 1,
  defaultVatRate: 21,
  defaultDepositPercent: 30,
}

describe('AI suggestions', () => {
  it('applies only recognized receipt values, including a zero VAT rate', () => {
    const suggestion = receiptSuggestionSchema.parse({
      ...unknownFiscal,
      date: null,
      concept: '  Material eléctrico  ',
      category: null,
      grossCents: 12345,
      vatRate: 0,
    })
    expect(
      applyReceiptSuggestion(
        {
          date: '2026-11-23',
          concept: '',
          category: 'Materiales',
          amount: '',
          vatRate: '21',
          kind: 'expense',
          ...blankFields,
        },
        suggestion,
      ),
    ).toEqual({
      date: '2026-11-23',
      concept: 'Material eléctrico',
      category: 'Materiales',
      amount: '123,45',
      vatRate: '0',
      kind: 'expense',
      ...blankFields,
    })
  })

  it('rejects invalid dates, invalid amounts and unexpected receipt fields', () => {
    const valid = {
      ...unknownFiscal,
      date: null,
      concept: null,
      category: null,
      grossCents: null,
      vatRate: null,
    }
    expect(receiptSuggestionSchema.safeParse(valid).success).toBe(true)
    expect(receiptSuggestionSchema.safeParse({ ...valid, date: '2026-02-30' }).success).toBe(false)
    expect(receiptSuggestionSchema.safeParse({ ...valid, grossCents: -1 }).success).toBe(false)
    expect(receiptSuggestionSchema.safeParse({ ...valid, vendorId: 'invented' }).success).toBe(
      false,
    )
  })

  it('preserves manually edited fields, including cleared fields, and requires a missing VAT rate', () => {
    const form = {
      ...blankFields,
      kind: 'expense' as const,
      date: '2026-01-01',
      concept: '',
      category: 'Manual',
      amount: '5',
      vatRate: '21',
    }
    const suggestion = {
      ...unknownFiscal,
      date: '2026-02-01',
      concept: 'Factura',
      category: 'IA',
      grossCents: 1210,
      vatRate: null,
    }
    const edited = new Set<keyof typeof form>(['concept', 'category', 'amount'])
    expect(applyReceiptSuggestion(form, suggestion, edited)).toEqual({
      ...blankFields,
      kind: 'expense',
      date: '2026-02-01',
      concept: '',
      category: 'Manual',
      amount: '5',
      vatRate: '',
    })
    edited.add('vatRate')
    expect(applyReceiptSuggestion(form, suggestion, edited).vatRate).toBe('21')
  })

  it('clears old auto-filled values when replacing a receipt without losing manual edits', () => {
    const form = {
      ...blankFields,
      kind: 'expense' as const,
      date: '2026-02-01',
      concept: 'Manual',
      category: 'IA',
      amount: '50',
      vatRate: '10',
    }
    const defaults = {
      ...blankFields,
      kind: 'expense' as const,
      date: '2026-01-01',
      concept: '',
      category: 'Materiales',
      amount: '',
      vatRate: '21',
    }
    expect(resetReceiptAutofill(form, defaults, new Set(['concept', 'amount']))).toEqual({
      ...defaults,
      kind: 'expense',
      concept: 'Manual',
      amount: '50',
    })
  })

  it('uses the issuer for expenses, recipient for income and applies a matching multi-rate breakdown', () => {
    const form = {
      ...blankFields,
      kind: 'expense' as const,
      date: '2026-01-01',
      concept: '',
      category: '',
      amount: '',
      vatRate: '21',
    }
    const suggestion = receiptSuggestionSchema.parse({
      ...unknownFiscal,
      date: null,
      concept: 'Factura',
      category: null,
      grossCents: 23100,
      vatRate: null,
      issuerName: 'Proveedor',
      issuerTaxId: 'B123',
      recipientName: 'Cliente',
      recipientTaxId: 'A456',
      documentNumber: 'F-42',
      vatLines: [
        { rate: 21, baseCents: 10000, vatCents: 2100 },
        { rate: 10, baseCents: 10000, vatCents: 1000 },
      ],
    })
    const expense = applyReceiptSuggestion(form, suggestion)
    expect(expense).toMatchObject({
      counterpartyName: 'Proveedor',
      counterpartyTaxId: 'B123',
      documentNumber: 'F-42',
      amount: '231,00',
      vatLines: [
        { rate: '21', base: '100,00', vat: '21,00' },
        { rate: '10', base: '100,00', vat: '10,00' },
      ],
    })
    expect(applyReceiptSuggestion({ ...form, kind: 'income' }, suggestion)).toMatchObject({
      counterpartyName: 'Cliente',
      counterpartyTaxId: 'A456',
    })
    const manual = applyReceiptSuggestion(
      { ...form, amount: '5', counterpartyName: 'Manual', vatRate: '4' },
      suggestion,
      new Set(['amount', 'counterpartyName', 'vatRate']),
    )
    expect(manual).toMatchObject({
      amount: '5',
      counterpartyName: 'Manual',
      vatRate: '4',
      vatLines: [],
    })
    expect(
      applyReceiptSuggestion(form, { ...suggestion, grossCents: 23099, vatRate: 21 }),
    ).toMatchObject({ vatRate: '', vatLines: [] })
  })

  it('appends complete lines to a sectioned draft without inventing missing prices', () => {
    const draft = buildEstimateDraft(tenant, 'client', 'Servicio', 'sections', id)
    const suggestion = estimateSuggestionSchema.parse({
      message: 'Falta el precio de la instalación.',
      lines: [
        {
          description: 'Cable',
          details: null,
          kind: 'material',
          unit: 'm',
          quantity: 2,
          unitPriceCents: 350,
        },
        {
          description: 'Instalación',
          details: null,
          kind: 'labor',
          unit: 'h',
          quantity: 1,
          unitPriceCents: null,
        },
      ],
    })
    const first = appendEstimateSuggestion(draft, suggestion, id)
    const result = { ...draft, ...first.patch }
    expect(first.incomplete).toBe(1)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.unitPriceCents).toBe(350)
    expect(result.sections?.find((section) => section.type === 'prices')).toMatchObject({
      lineIds: [result.lines[0]?.id],
    })
    expect(newEstimateError(result)).toBeNull()
    const second = appendEstimateSuggestion(result, suggestion, id)
    expect(second.patch.lines?.[0]).toEqual(result.lines[0])
    expect(second.patch.lines).toHaveLength(2)
  })

  it('does not mutate an invalid sectioned draft or accept malformed prices', () => {
    const draft = {
      ...buildEstimateDraft(tenant, 'client', 'Servicio', 'sections', id),
      sections: [],
    }
    const line = {
      description: 'Cable',
      details: null,
      kind: 'material',
      unit: 'm',
      quantity: 1,
      unitPriceCents: 0,
    }
    const suggestion = estimateSuggestionSchema.parse({ message: 'Propuesta', lines: [line] })
    expect(appendEstimateSuggestion(draft, suggestion, id).patch).toEqual({})
    expect(
      estimateSuggestionSchema.safeParse({
        message: 'Propuesta',
        lines: [{ ...line, unitPriceCents: 1.5 }],
      }).success,
    ).toBe(false)
  })
})
