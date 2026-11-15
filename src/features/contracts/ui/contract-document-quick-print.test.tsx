import type * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Client, Tenant } from '@/shared/domain/types'

import type { ServiceContract } from '../application/contract-actions'

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  print: vi.fn(),
  error: vi.fn(),
  handle: undefined as undefined | { print: () => void },
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useRef: () => ({ current: { id: 'document' } }),
  useImperativeHandle: (_ref: unknown, create: () => { print: () => void }) => {
    mocks.handle = create()
  },
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => mocks.query }))
vi.mock('@doscientos/ui', () => ({ Button: () => null, toast: { error: mocks.error } }))
vi.mock('@/shared/lib/print-document', () => ({ printDocument: mocks.print }))

import { ContractDocument } from './contract-document'

const contract = {
  title: 'Contrato',
  origin_estimate_id: 'estimate',
  tenant_id: 'tenant',
  included_scope: [],
  price_cents: 0,
  billing_frequency: 'monthly',
} as unknown as ServiceContract
function render() {
  ContractDocument({ contract, tenant: {} as Tenant, client: undefined as Client | undefined })
}

describe('quick contract printing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.print.mockResolvedValue(undefined)
    mocks.handle = undefined
  })
  it('uses the complete contract document when the accepted estimate is available', () => {
    mocks.query = { data: { source: 'publication' } }
    render()
    mocks.handle?.print()
    expect(mocks.print).toHaveBeenCalledWith({ id: 'document' }, 'Contrato Contrato')
  })
  it.each([{ isPending: true }, { isError: true }, { data: { source: 'migration' } }])(
    'does not print an unready, missing or unreviewed annex',
    (query) => {
      mocks.query = query
      render()
      mocks.handle?.print()
      expect(mocks.print).not.toHaveBeenCalled()
      expect(mocks.error).toHaveBeenCalledOnce()
    },
  )
})
