import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyContractJob } from '../domain/contract-job'
import {
  listCleaningServices,
  listContractJobs,
  saveContractJob,
} from './cleaning-service-repository'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}))

describe('cleaning service center data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const query = { select: mocks.select, eq: mocks.eq, order: mocks.order, range: mocks.range }
    mocks.from.mockReturnValue(query)
    mocks.select.mockReturnValue(query)
    mocks.eq.mockReturnValue(query)
    mocks.order.mockReturnValue(query)
  })

  it.each(['object', 'array'] as const)(
    'normalizes a joined center returned as an %s',
    async (shape) => {
      const center = {
        name: 'Portal DEMO',
        address: 'Dirección ficticia',
        operational_contact: 'Oficina',
        access_notes: 'Entrada lateral',
        notes: '',
      }
      mocks.order.mockResolvedValue({
        data: [{ id: 'service-1', location: shape === 'array' ? [center] : center }],
        error: null,
      })
      const services = await listCleaningServices('tenant-1', 'contract-1')
      expect(services[0]?.location).toEqual(center)
      expect(mocks.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1')
      expect(mocks.eq).toHaveBeenCalledWith('contract_id', 'contract-1')
    },
  )

  it('keeps a missing center null and propagates read errors', async () => {
    mocks.order.mockResolvedValueOnce({ data: [{ id: 'service-1', location: [] }], error: null })
    expect((await listCleaningServices('tenant-1', 'contract-1'))[0]?.location).toBeNull()
    mocks.order.mockResolvedValueOnce({ data: null, error: { message: 'Sin conexión' } })
    await expect(listCleaningServices('tenant-1', 'contract-1')).rejects.toThrow('Sin conexión')
  })

  it.each(['object', 'array'] as const)(
    'normalizes and paginates contracted jobs with %s joins',
    async (shape) => {
      const contract = {
        id: 'contract-1',
        title: 'Office cleaning',
        client_id: 'client-1',
        status: 'draft',
      }
      mocks.range.mockResolvedValue({
        data: [{ id: 'job-1', contract: shape === 'array' ? [contract] : contract, location: [] }],
        error: null,
        count: 21,
      })
      const result = await listContractJobs('tenant-1', 1)
      expect(result).toMatchObject({
        count: 21,
        pageSize: 20,
        items: [{ id: 'job-1', contract, location: null }],
      })
      expect(mocks.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1')
      expect(mocks.range).toHaveBeenCalledWith(20, 39)
      expect(mocks.order).toHaveBeenCalledWith('id', { ascending: false })
    },
  )

  it('passes job identity, optimistic version and operation id to the server', async () => {
    const service = emptyContractJob('2026-12-01')
    const input = {
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      jobId: 'quoted-job',
      expectedUpdatedAt: 'version',
      service,
      operationId: 'operation',
    }
    mocks.rpc.mockResolvedValueOnce({ error: null })
    await saveContractJob(input)
    expect(mocks.rpc).toHaveBeenCalledWith('save_contract_job', {
      p_tenant_id: 'tenant-1',
      p_contract_id: 'contract-1',
      p_job_id: 'quoted-job',
      p_expected_updated_at: 'version',
      p_service: service,
      p_operation_id: 'operation',
    })
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'Recarga el contrato' } })
    await expect(saveContractJob(input)).rejects.toThrow('Recarga el contrato')
  })
})
