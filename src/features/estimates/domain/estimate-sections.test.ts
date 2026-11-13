import { describe, expect, it } from 'vitest'

import { estimateTotals } from '@/shared/domain/estimate'
import { estimateSectionsSchema, type EstimateSection } from '@/shared/domain/estimate-document'
import type { Estimate, EstimateLine } from '@/shared/domain/types'

import {
  changeEstimateSectionType,
  copyEstimateSections,
  createEstimateSection,
  duplicateEstimateSection,
  ensureRequiredEstimateSections,
  estimateSectionHasContent,
  moveEstimateSection,
  removeEstimateSection,
  requiredEstimateSectionsError,
  replaceSectionLines,
} from './estimate-sections'

const id = (number: number) => `80000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const line = (number: number, price: number): EstimateLine => ({
  id: id(number),
  catalogItemId: null,
  description: `Servicio ${number}`,
  kind: 'labor',
  unit: 'ud',
  quantity: 1,
  unitPriceCents: price,
  discountPercent: 0,
})
const prices = (number: number, lineIds: string[]): EstimateSection => ({
  id: id(number),
  type: 'prices',
  title: 'Oferta económica',
  pageBreakBefore: false,
  lineIds,
})
const estimate = (): Estimate => ({
  id: id(1),
  tenantId: id(2),
  clientId: id(3),
  number: 'P-1',
  title: 'Limpieza',
  status: 'draft',
  documentFormat: 'sections',
  sections: [prices(10, [id(20)]), prices(11, [id(21)])],
  lines: [line(20, 10_000), line(21, 5000)],
  discountType: 'percent',
  discountValue: 10,
  vatRate: 21,
  milestones: [],
  clauses: '',
  validUntil: '2027-01-01',
  createdAt: '2026-11-13',
})

describe('estimate sections', () => {
  it('creates valid empty editors for every section type', () => {
    let sequence = 0
    const sections = (['description', 'prices', 'list', 'work_table'] as const).map((type) =>
      createEstimateSection(type, () => id(++sequence)),
    )
    expect(estimateSectionsSchema.safeParse(sections).success).toBe(true)
  })

  it('updates one price block without losing the other block or its discounts', () => {
    const value = estimate()
    const updated = {
      ...value,
      ...replaceSectionLines(value, id(10), [line(20, 20_000), line(22, 1000)]),
    }
    expect(updated.lines).toContainEqual(line(21, 5000))
    expect(updated.sections?.[0]).toMatchObject({ lineIds: [id(20), id(22)] })
    expect(estimateTotals(updated).subtotalCents).toBe(23_400)
    expect(value.lines).toHaveLength(2)
  })

  it('never changes, removes or duplicates required sections', () => {
    const value = estimate()
    for (const type of ['prices', 'work_table'] as const) {
      const section = createEstimateSection(type, () => id(40))
      const current = { ...value, sections: [section] }
      expect(changeEstimateSectionType(current, section.id, 'description', () => id(50))).toEqual(
        {},
      )
      expect(removeEstimateSection(current, section.id)).toEqual({})
      expect(duplicateEstimateSection(current, section.id, () => id(50))).toEqual({})
    }
  })

  it('cannot create extra required sections by changing a text type', () => {
    const section = createEstimateSection('description', () => id(40))
    const value = { ...estimate(), sections: [section] }
    for (const type of ['prices', 'work_table'] as const)
      expect(changeEstimateSectionType(value, section.id, type, () => id(50))).toEqual({})
  })

  it('does not reset content when the selected type is unchanged or the section is missing', () => {
    const value = estimate()
    expect(changeEstimateSectionType(value, id(10), 'prices', () => id(50))).toEqual({})
    expect(changeEstimateSectionType(value, id(99), 'description', () => id(50))).toEqual({})
  })

  it('only asks to discard sections that actually contain content, including service details', () => {
    let sequence = 50
    for (const type of ['description', 'prices', 'work_table', 'list'] as const) {
      expect(estimateSectionHasContent(createEstimateSection(type, () => id(sequence++)))).toBe(
        false,
      )
    }
    const base = { id: id(10), title: 'Alcance', pageBreakBefore: false }
    expect(estimateSectionHasContent({ ...base, type: 'description', content: '  \n' })).toBe(false)
    expect(estimateSectionHasContent({ ...base, type: 'description', content: 'Texto' })).toBe(true)
    expect(estimateSectionHasContent(prices(10, [id(20)]))).toBe(true)
    expect(
      estimateSectionHasContent({
        ...base,
        type: 'list',
        items: [{ id: id(11), text: 'Cristales' }],
      }),
    ).toBe(true)
    for (const field of ['task', 'frequency', 'notes'] as const) {
      expect(
        estimateSectionHasContent({
          ...base,
          type: 'work_table',
          rows: [{ id: id(11), task: '', frequency: '', notes: '', [field]: 'Contenido' }],
        }),
      ).toBe(true)
    }
  })

  it('still removes optional text without touching priced lines', () => {
    const section = createEstimateSection('description', () => id(40))
    const value = { ...estimate(), sections: [...(estimate().sections ?? []), section] }
    const updated = { ...value, ...removeEstimateSection(value, section.id) }
    expect(updated.lines).toEqual(value.lines)
    expect(updated.sections).toEqual(estimate().sections)
  })

  it('reorders sections without mutating or changing financial data', () => {
    const value = estimate()
    const sections = value.sections ?? []
    expect(moveEstimateSection(sections, id(11), -1)).toEqual([sections[1], sections[0]])
    expect(moveEstimateSection(sections, id(10), -1)).toBe(sections)
    expect(moveEstimateSection(sections, 'missing', 1)).toBe(sections)
    expect(sections[0]?.id).toBe(id(10))
  })

  it('duplicates optional text while leaving the single required blocks untouched', () => {
    const text = createEstimateSection('description', () => id(40))
    const value = { ...estimate(), sections: [text] }
    let sequence = 50
    const updated = { ...value, ...duplicateEstimateSection(value, text.id, () => id(sequence++)) }
    expect(updated.sections?.map((section) => section.id)).toEqual([id(40), id(50)])
    expect(updated.sections?.[1]).toMatchObject({ type: 'description', title: 'Texto (copia)' })
    expect(updated.lines).toBe(value.lines)
  })

  it('adds missing mandatory sections and merges old duplicates without losing content or order', () => {
    const first = createEstimateSection('work_table', () => id(40))
    const second = createEstimateSection('work_table', () => id(41))
    const sections = [prices(10, [id(20)]), first, prices(11, [id(21)]), second]
    const normalized = ensureRequiredEstimateSections(sections, () => id(50))
    expect(normalized.map((section) => section.id)).toEqual([id(10), id(40)])
    expect(normalized[0]).toMatchObject({ lineIds: [id(20), id(21)] })
    expect(normalized[1]).toMatchObject({
      rows: [
        ...(first.type === 'work_table' ? first.rows : []),
        ...(second.type === 'work_table' ? second.rows : []),
      ],
    })
    expect(ensureRequiredEstimateSections(normalized, () => id(60))).toBe(normalized)
    expect(
      requiredEstimateSectionsError({ documentFormat: 'sections', sections: normalized }),
    ).toBeNull()
    expect(
      ensureRequiredEstimateSections([], () => crypto.randomUUID()).map((section) => section.type),
    ).toEqual(['prices', 'work_table'])
  })

  it('requires exactly one of each mandatory type while keeping traditional documents compatible', () => {
    const sections = ensureRequiredEstimateSections([], () => crypto.randomUUID())
    for (const type of ['prices', 'work_table'] as const) {
      expect(
        requiredEstimateSectionsError({
          documentFormat: 'sections',
          sections: sections.filter((section) => section.type !== type),
        }),
      ).not.toBeNull()
      expect(
        requiredEstimateSectionsError({
          documentFormat: 'sections',
          sections: [...sections, createEstimateSection(type, () => id(50))],
        }),
      ).not.toBeNull()
    }
    expect(requiredEstimateSectionsError({ documentFormat: 'table', sections: [] })).toBeNull()
  })

  it('copies nested rows and remaps every price reference into the new estimate', () => {
    const sections: EstimateSection[] = [
      prices(10, [id(20)]),
      {
        id: id(11),
        type: 'list',
        title: 'Incluye',
        pageBreakBefore: true,
        items: [{ id: id(30), text: 'Productos' }],
      },
    ]
    let sequence = 50
    const copy = copyEstimateSections(sections, new Map([[id(20), id(40)]]), () => id(sequence++))
    expect(copy[0]).toMatchObject({ lineIds: [id(40)] })
    expect(copy[1]).toMatchObject({
      pageBreakBefore: true,
      items: [{ id: id(52), text: 'Productos' }],
    })
    expect(sections[1]).toMatchObject({ items: [{ id: id(30) }] })
  })

  it('rejects duplicated price references and malformed content rather than dropping it', () => {
    expect(
      estimateSectionsSchema.safeParse([prices(10, [id(20)]), prices(11, [id(20)])]).success,
    ).toBe(false)
    expect(
      estimateSectionsSchema.safeParse([
        { id: id(10), type: 'description', title: 'Alcance', pageBreakBefore: false, content: 42 },
      ]).success,
    ).toBe(false)
    expect(
      estimateSectionsSchema.safeParse(Array.from({ length: 51 }, (_, index) => prices(index, [])))
        .success,
    ).toBe(false)
  })
})
