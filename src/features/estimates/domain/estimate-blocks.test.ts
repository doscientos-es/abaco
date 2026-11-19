import { describe, expect, it } from 'vitest'

import type { EstimateBlock } from '@/shared/domain/document-library'
import { estimateSectionLimits } from '@/shared/domain/estimate-document'
import { formLimits } from '@/shared/domain/form-limits'
import type { Estimate } from '@/shared/domain/types'

import { insertEstimateBlock } from './estimate-blocks'
import { buildEstimateDraft } from './new-estimate'

const block: EstimateBlock = {
  id: 'f0000000-0000-4000-8000-000000000001',
  name: 'Garantía',
  category: 'warranty',
  content: 'Cubre la instalación.',
}

function draft(format: Estimate['documentFormat']) {
  return buildEstimateDraft(
    {
      id: 'tenant',
      name: 'Empresa',
      taxId: '',
      phone: '',
      email: '',
      nextEstimateNumber: 1,
      defaultVatRate: 21,
      defaultDepositPercent: 30,
    },
    'client',
    'Servicio',
    format ?? 'table',
    () => crypto.randomUUID(),
  )
}

describe('reusable estimate blocks', () => {
  it('preserves existing conditions when adding a block to a table estimate', () => {
    const estimate = { ...draft('table'), clauses: 'Condición existente.' }
    expect(insertEstimateBlock(estimate, block, () => 'unused')).toEqual({
      clauses: 'Condición existente.\n\nGarantía\nCubre la instalación.',
    })
  })

  it('adds an independent text section without changing existing sections', () => {
    const estimate = draft('sections')
    expect(insertEstimateBlock(estimate, block, () => 'new-section')).toEqual({
      sections: [
        ...(estimate.sections ?? []),
        {
          id: 'new-section',
          title: block.name,
          content: block.content,
          type: 'description',
          pageBreakBefore: false,
        },
      ],
    })
  })

  it('rejects insertion when either document format is full', () => {
    const table = { ...draft('table'), clauses: 'x'.repeat(formLimits.estimateClauses) }
    const base = draft('sections')
    const sections = Array.from({ length: estimateSectionLimits.sections }, (_, index) => ({
      id: String(index),
      type: 'description' as const,
      title: '',
      content: '',
      pageBreakBefore: false,
    }))
    expect(insertEstimateBlock(table, block, () => 'new')).toBeNull()
    expect(insertEstimateBlock({ ...base, sections }, block, () => 'new')).toBeNull()
  })
})
