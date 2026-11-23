import { describe, expect, it } from 'vitest'

import { buildEstimateDraft, newEstimateError } from '@/features/estimates/domain/new-estimate'
import type { Tenant } from '@/shared/domain/types'

import {
  appendEstimateSuggestion,
  applyReceiptSuggestion,
  estimateSuggestionSchema,
  receiptSuggestionSchema,
} from './suggestions'

let sequence = 0
const id = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
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
    })
  })

  it('rejects invalid dates, invalid amounts and unexpected receipt fields', () => {
    const valid = { date: null, concept: null, category: null, grossCents: null, vatRate: null }
    expect(receiptSuggestionSchema.safeParse({ ...valid, date: '2026-02-30' }).success).toBe(false)
    expect(receiptSuggestionSchema.safeParse({ ...valid, grossCents: -1 }).success).toBe(false)
    expect(receiptSuggestionSchema.safeParse({ ...valid, vendorId: 'invented' }).success).toBe(
      false,
    )
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
