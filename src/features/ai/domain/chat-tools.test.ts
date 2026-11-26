import { describe, expect, it } from 'vitest'

import type { Estimate } from '@/shared/domain/types'

import {
  applyEstimateLineEdit,
  estimateLineEditSchema,
  inventoryProposalSchema,
} from './chat-tools'

const id = '00000000-0000-4000-8000-000000000001'
const lineId = '00000000-0000-4000-8000-000000000002'
const estimate = {
  id,
  status: 'draft',
  lines: [
    {
      id: lineId,
      description: 'Material',
      quantity: 2,
      unit: 'ud',
      unitPriceCents: 100,
      discountPercent: 10,
    },
  ],
} as Estimate
const proposal = {
  estimateId: id,
  lineId,
  description: null,
  quantity: 3,
  unit: null,
  unitPriceCents: null,
}

describe('AI edit proposals', () => {
  it('only changes requested fields on the matching draft line', () => {
    expect(applyEstimateLineEdit(estimate, proposal)?.lines).toEqual([
      { ...estimate.lines[0], quantity: 3 },
    ])
    expect(applyEstimateLineEdit({ ...estimate, status: 'sent' }, proposal)).toBeNull()
    expect(applyEstimateLineEdit({ ...estimate, id: lineId }, proposal)).toBeNull()
    expect(applyEstimateLineEdit({ ...estimate, lines: [] }, proposal)).toBeNull()
  })

  it('rejects invalid quantities and prices before a proposal can be applied', () => {
    expect(estimateLineEditSchema.safeParse({ ...proposal, quantity: -1 }).success).toBe(false)
    expect(estimateLineEditSchema.safeParse({ ...proposal, unitPriceCents: -1 }).success).toBe(
      false,
    )
    expect(inventoryProposalSchema.safeParse({ catalogItemId: id, quantity: 1.2345 }).success).toBe(
      false,
    )
  })
})
