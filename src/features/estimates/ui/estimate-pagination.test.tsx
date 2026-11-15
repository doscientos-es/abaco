import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { Estimate, Tenant } from '@/shared/domain/types'

const state = vi.hoisted(() => ({ counts: [2, 3, 4] }))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: () => [state.counts, vi.fn()],
}))

import { EstimateDocument } from './estimate-document'

const tenant: Tenant = {
  id: 'tenant',
  name: 'Empresa',
  taxId: '',
  email: '',
  phone: '',
  defaultVatRate: 21,
  defaultDepositPercent: 0,
  nextEstimateNumber: 1,
}
const estimate: Estimate = {
  id: 'estimate',
  tenantId: 'tenant',
  clientId: 'client',
  number: 'P-1',
  title: 'Servicio',
  status: 'draft',
  lines: [],
  milestones: [],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  clauses: '',
  validUntil: '2027-01-01',
  createdAt: '2026-11-15',
}

describe('estimate pagination across document sections', () => {
  it('numbers cover, index and content overflow pages as one document', () => {
    const html = renderToStaticMarkup(
      <EstimateDocument estimate={estimate} tenant={tenant} client={undefined} />,
    )
    const pages = html.split('class="estimate-document__page"').slice(1)
    expect(pages).toHaveLength(9)
    pages.forEach((page, index) => expect(page).toContain(`Página ${index + 1} de 9`))
    expect(pages[1]).toContain('estimate-document__cover')
    expect(pages[2]).toContain('estimate-document__index')
    expect(pages[5]).toContain('estimate-document__content')
  })
})
