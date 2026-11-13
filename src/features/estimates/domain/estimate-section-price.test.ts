import { describe, expect, it } from 'vitest'

import { estimateTotals } from '@/shared/domain/estimate'
import { estimateSectionsSchema } from '@/shared/domain/estimate-document'
import type { Estimate, EstimateLine } from '@/shared/domain/types'
import {
  estimateFromRow,
  estimateToRow,
  lineToRow,
  type EstimateRow,
} from '@/shared/store/supabase-mappers'

import {
  changeSectionPrice,
  estimatePriceFrequency,
  sectionPriceBeforeDiscount,
  sectionPriceNarrative,
  sectionPriceTotal,
  type PriceSection,
} from './estimate-section-price'

const id = (value: number) => `84000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const section: PriceSection = {
  id: id(10),
  type: 'prices',
  title: 'Precio',
  pageBreakBefore: false,
  lineIds: [],
}
const line = (value: number, cents: number): EstimateLine => ({
  id: id(value),
  catalogItemId: null,
  description: 'Precio',
  kind: 'labor',
  unit: 'ud',
  quantity: 1,
  unitPriceCents: cents,
  discountPercent: 0,
})
const estimate: Estimate = {
  id: id(1),
  tenantId: id(2),
  clientId: id(3),
  number: 'P-1',
  title: 'Servicio',
  status: 'draft',
  documentFormat: 'sections',
  conversionDestination: 'contract',
  contractBillingFrequency: 'monthly',
  sections: [section],
  lines: [],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  milestones: [],
  clauses: '',
  validUntil: '2027-01-01',
  createdAt: '2026-11-13',
}

function setPrice(value: Estimate, priceSection: PriceSection, cents: number): Estimate {
  const result = changeSectionPrice(value, priceSection, cents, () => id(20))
  if (!result.ok) throw new Error(result.error)
  return { ...value, ...result.patch }
}

describe('simple price sections', () => {
  it('treats 216,32 as tax inclusive and persists only its taxable base in priced lines', () => {
    const updated = setPrice(estimate, section, 21_632)
    expect(updated.lines).toEqual([line(20, 17_878)])
    expect(estimateTotals(updated)).toMatchObject({
      subtotalCents: 17_878,
      vatCents: 3754,
      totalCents: 21_632,
    })
    expect(estimateSectionsSchema.safeParse(updated.sections).success).toBe(true)
    expect(updated.sections?.[0]).toMatchObject({ lineIds: [id(20)] })
    expect(sectionPriceBeforeDiscount(updated, { ...section, lineIds: [id(20)] })).toBe(21_632)
    expect(estimate.lines).toEqual([])
  })

  it('round-trips price and frequency through the existing database mappers', () => {
    const updated = {
      ...setPrice(estimate, section, 21_632),
      contractBillingFrequency: 'quarterly' as const,
    }
    const row: EstimateRow = {
      ...estimateToRow(updated),
      estimate_lines: updated.lines.map((item, index) => ({
        ...lineToRow(updated, item, index),
        id: item.id,
        estimate_id: updated.id,
      })),
      estimate_milestones: [],
    }
    const loaded = estimateFromRow(row)
    expect(loaded.sections).toEqual(updated.sections)
    expect(loaded.contractBillingFrequency).toBe('quarterly')
    expect(estimateTotals(loaded).totalCents).toBe(21_632)
  })

  it('retains historical lines until edited and then consolidates only the chosen section', () => {
    const selected = { ...section, lineIds: [id(20), id(21)] }
    const other: PriceSection = { ...section, id: id(11), lineIds: [id(22)] }
    const value = {
      ...estimate,
      sections: [selected, other],
      lines: [line(20, 10_000), line(21, 5000), line(22, 1000)],
    }
    expect(sectionPriceBeforeDiscount(value, selected)).toBe(18_150)
    const updated = setPrice(value, selected, 21_632)
    expect(updated.lines).toEqual([line(22, 1000), line(20, 17_878)])
    expect(updated.sections?.[1]).toEqual(other)
    expect(value.lines).toHaveLength(3)
  })

  it('never saves an amount that would disagree with VAT rounding', () => {
    const result = changeSectionPrice(estimate, section, 21_633, () => id(20))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('216,34') })
    expect(estimate.lines).toEqual([])
  })

  it('does not consolidate or erase historical details just by focusing and blurring the price', () => {
    const selected = { ...section, lineIds: [id(20), id(21)] }
    const value = { ...estimate, sections: [selected], lines: [line(20, 10_000), line(21, 5000)] }
    expect(changeSectionPrice(value, selected, 18_150, () => id(30))).toEqual({
      ok: true,
      patch: {},
    })
    expect(value.lines).toHaveLength(2)
  })

  it('backfills an empty historical heading so the generated price can be published', () => {
    const selected = { ...section, title: '' }
    const updated = setPrice({ ...estimate, sections: [selected] }, selected, 21_632)
    expect(updated.sections?.[0]?.title).toBe('Precio')
  })

  it.each([-1, 1.2, NaN, Infinity, 100_000_000_000])('rejects invalid input %s', (amount) => {
    expect(changeSectionPrice(estimate, section, amount, () => id(20)).ok).toBe(false)
  })

  it.each([0, 10, 21])('handles zero and tax-inclusive prices at %i%% VAT', (vatRate) => {
    const updated = setPrice({ ...estimate, vatRate }, section, 0)
    expect(estimateTotals(updated).totalCents).toBe(0)
    const gross = 10_000 + Math.round((10_000 * vatRate) / 100)
    expect(estimateTotals(setPrice({ ...estimate, vatRate }, section, gross)).totalCents).toBe(
      gross,
    )
  })

  it.each([
    { type: 'none', value: 0 },
    { type: 'percent', value: 10 },
    { type: 'amount', value: 1000 },
    { type: 'amount', value: 999_999 },
  ] as const)(
    'allocates $type discounts and VAT exactly once across all paragraphs',
    ({ type, value }) => {
      const sections = [
        { ...section, lineIds: [id(20), id(22)] },
        { ...section, id: id(11), lineIds: [id(21)] },
      ]
      const updated = {
        ...estimate,
        sections,
        lines: [line(20, 17_878), { ...line(21, 1001), discountPercent: 5 }, line(22, 10_001)],
        discountType: type,
        discountValue: value,
      }
      expect(sections.reduce((sum, item) => sum + sectionPriceTotal(updated, item), 0)).toBe(
        estimateTotals(updated).totalCents,
      )
      expect(sectionPriceTotal(updated, { ...section, lineIds: [] })).toBe(0)
    },
  )

  it('uses the agreed periodicity, with coherent defaults for historical documents', () => {
    expect(estimatePriceFrequency(estimate)).toBe('monthly')
    expect(estimatePriceFrequency({ ...estimate, contractBillingFrequency: 'once' })).toBe('once')
    const historical = { ...estimate }
    delete historical.contractBillingFrequency
    expect(estimatePriceFrequency(historical)).toBe('monthly')
    expect(
      estimatePriceFrequency({
        ...historical,
        conversionDestination: 'work',
      }),
    ).toBe('once')
  })

  it('writes the exact requested monthly paragraph, with correct Spanish accents and spacing', () => {
    expect(sectionPriceNarrative(21_632, 'monthly')).toEqual({
      heading: 'PRESUPUESTO MENSUAL. -',
      body: 'Asciende el presente presupuesto a la cantidad MENSUAL de DOSCIENTOS DIECISÉIS EUROS CON TREINTA Y DOS CÉNTIMOS (216,32.-) impuestos incluidos.',
    })
  })

  it.each([
    ['once', 'ÚNICO', 'ÚNICA'],
    ['quarterly', 'TRIMESTRAL', 'TRIMESTRAL'],
    ['yearly', 'ANUAL', 'ANUAL'],
  ] as const)(
    'writes the %s price without hardcoded monthly wording',
    (frequency, heading, adjective) => {
      const copy = sectionPriceNarrative(100, frequency)
      expect(copy.heading).toBe(`PRESUPUESTO ${heading}. -`)
      expect(copy.body).toContain(`cantidad ${adjective} de UN EURO (1,00.-)`)
    },
  )
})
