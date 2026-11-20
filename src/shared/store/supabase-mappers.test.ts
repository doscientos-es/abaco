import { describe, expect, it } from 'vitest'

import type { Estimate, EstimateLine } from '../domain/types'
import { estimateFromRow, lineToRow } from './supabase-mappers'

const estimate = { id: 'estimate-1', tenantId: 'tenant-1' } as Estimate
const line: EstimateLine = {
  id: 'line-1',
  catalogItemId: 'catalog-item-1',
  description: 'Pintura de paredes',
  details: 'Acabado mate',
  kind: 'material',
  unit: 'm²',
  quantity: 10,
  unitPriceCents: 500,
  discountPercent: 0,
}

describe('estimate line details persistence', () => {
  it('maps optional details to and from estimate line rows', () => {
    const row = lineToRow(estimate, line, 0)

    expect(row).toMatchObject({ details: 'Acabado mate', catalog_item_id: 'catalog-item-1' })
    expect(
      estimateFromRow({
        id: 'estimate-1',
        tenant_id: 'tenant-1',
        estimate_lines: [{ ...row, id: line.id, estimate_id: 'estimate-1' }],
        estimate_milestones: [],
      }).lines[0],
    ).toMatchObject({ details: 'Acabado mate', catalogItemId: 'catalog-item-1' })
  })

  it('stores an empty optional description as null', () => {
    expect(lineToRow(estimate, { ...line, details: '  ' }, 0).details).toBeNull()
  })
})
