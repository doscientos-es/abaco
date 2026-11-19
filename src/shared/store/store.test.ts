import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TenantData } from '../domain/types'
import {
  currentTenantData,
  getSaveStatus,
  hydrateStore,
  refreshStore,
  retryStoreSaves,
  setActiveTenantId,
  setRepository,
  synchronizeStoreSaves,
  updateTenantData,
  type AppState,
  type TenantRepository,
} from './store'

const tenant = (id: string, name: string): TenantData => ({
  tenant: {
    id,
    name,
    taxId: '',
    email: '',
    phone: '',
    defaultVatRate: 21,
    defaultDepositPercent: 30,
    nextEstimateNumber: 1,
  },
  clients: [],
  catalog: [],
  estimates: [],
  ledger: [],
  invoices: [],
})

const initial = (): AppState => ({
  activeTenantId: 'a',
  tenants: { a: tenant('a', 'A'), b: tenant('b', 'B') },
})

const billedState = (): AppState => {
  const snapshot = initial()
  const data = tenant('a', 'A')
  snapshot.tenants.a = data
  data.estimates = [
    {
      id: 'estimate',
      tenantId: 'a',
      number: 'P-1',
      clientId: 'client',
      title: 'Servicio',
      status: 'draft',
      lines: [],
      milestones: [{ id: 'milestone', label: 'Señal', percent: 100 }],
      vatRate: 21,
      discountType: 'none',
      discountValue: 0,
      clauses: '',
      validUntil: '2026-12-01',
      createdAt: '2026-11-01',
    },
  ]
  data.invoices = [
    {
      id: 'invoice',
      tenantId: 'a',
      number: 'F-1',
      clientId: 'client',
      estimateId: 'estimate',
      milestoneId: 'milestone',
      workExtraId: null,
      concept: 'Señal',
      totalCents: 12100,
      paidCents: 0,
      vatRate: 21,
      status: 'issued',
      documentStatus: 'issued',
      emailAcceptedAt: null,
      issuedAt: '2026-11-01',
      dueDate: '2026-12-01',
    },
  ]
  return snapshot
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('store persistence', () => {
  beforeEach(() => setRepository({ load: async () => initial(), save: async () => undefined }))

  it('does not apply an older server response over a newer edit', async () => {
    const first = deferred<AppState | undefined>()
    const second = deferred<AppState | undefined>()
    const save = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const repository: TenantRepository = { load: async () => initial(), save }
    setRepository(repository)
    await hydrateStore()

    updateTenantData((data) => ({ ...data, tenant: { ...data.tenant, name: 'Primero' } }))
    updateTenantData((data) => ({ ...data, tenant: { ...data.tenant, name: 'Segundo' } }))
    first.resolve({ ...initial(), tenants: { ...initial().tenants, a: tenant('a', 'Primero') } })
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(currentTenantData()?.tenant.name).toBe('Segundo')
    expect(getSaveStatus()).toEqual({ state: 'saving' })
    second.resolve(undefined)
    await vi.waitFor(() => expect(getSaveStatus()).toEqual({ state: 'saved', confirmed: true }))
  })

  it('keeps the current company and rejects a stale refresh', async () => {
    const reloading = deferred<AppState>()
    const load = vi
      .fn()
      .mockResolvedValueOnce(initial())
      .mockImplementationOnce(() => reloading.promise)
    setRepository({ load, save: async () => undefined })
    await hydrateStore()
    const refresh = refreshStore()
    setActiveTenantId('b')
    reloading.resolve(initial())
    await refresh
    expect(currentTenantData()?.tenant.id).toBe('b')
  })

  it('keeps failed edits and retries them without losing later edits', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValue(undefined)
    setRepository({ load: async () => initial(), save })
    await hydrateStore()
    updateTenantData((data) => ({ ...data, tenant: { ...data.tenant, name: 'Uno' } }))
    await vi.waitFor(() => expect(getSaveStatus().state).toBe('error'))
    updateTenantData((data) => ({ ...data, tenant: { ...data.tenant, name: 'Dos' } }))
    expect(currentTenantData()?.tenant.name).toBe('Dos')
    retryStoreSaves()
    await vi.waitFor(() => expect(getSaveStatus().state).toBe('saved'))
    expect(save).toHaveBeenCalledTimes(3)
    expect(currentTenantData()?.tenant.name).toBe('Dos')
  })

  it('does not restore another session from an in-flight load', async () => {
    const oldLoad = deferred<AppState>()
    setRepository({ load: () => oldLoad.promise, save: async () => undefined })
    const stale = hydrateStore()
    setRepository({
      load: async () => ({ ...initial(), activeTenantId: 'b' }),
      save: async () => undefined,
    })
    await hydrateStore()
    oldLoad.resolve(initial())
    await stale
    expect(currentTenantData()?.tenant.id).toBe('b')
  })

  it('recovers a rejected invoice-source deletion and persists later edits', async () => {
    let server = billedState()
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('violates invoices_milestone_id_tenant_id_fkey'))
      .mockImplementation(async (_previous: AppState, next: AppState) => {
        server = next
      })
    setRepository({ load: async () => server, save })
    await hydrateStore()
    updateTenantData((data) => ({ ...data, estimates: [] }))
    await vi.waitFor(() => expect(getSaveStatus().state).toBe('error'))
    updateTenantData((data) => ({ ...data, tenant: { ...data.tenant, name: 'Editado después' } }))

    await synchronizeStoreSaves()

    expect(getSaveStatus().state).toBe('saved')
    expect(currentTenantData()?.estimates[0]?.id).toBe('estimate')
    expect(currentTenantData()?.invoices).toHaveLength(1)
    expect(currentTenantData()?.tenant.name).toBe('Editado después')
    expect(server.tenants.a?.tenant.name).toBe('Editado después')
    expect(save).toHaveBeenCalledTimes(3)
  })

  it('keeps the entire queue if loading recovery data fails, and can retry recovery', async () => {
    let server = billedState()
    const load = vi
      .fn()
      .mockResolvedValueOnce(server)
      .mockRejectedValueOnce(new Error('Sin conexión al recuperar'))
      .mockImplementation(async () => server)
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('violates invoices_milestone_id_tenant_id_fkey'))
      .mockImplementation(async (_previous: AppState, next: AppState) => {
        server = next
      })
    setRepository({ load, save })
    await hydrateStore()
    updateTenantData((data) => ({ ...data, estimates: [] }))
    await vi.waitFor(() => expect(getSaveStatus().state).toBe('error'))
    await expect(synchronizeStoreSaves()).rejects.toThrow('Sin conexión al recuperar')
    expect(currentTenantData()?.estimates).toEqual([])
    expect(save).toHaveBeenCalledOnce()
    await synchronizeStoreSaves()
    expect(getSaveStatus().state).toBe('saved')
    expect(currentTenantData()?.estimates).toHaveLength(1)
  })

  it('includes edits queued while recovery is loading', async () => {
    let server = billedState()
    const recovering = deferred<AppState>()
    const load = vi
      .fn()
      .mockResolvedValueOnce(server)
      .mockImplementationOnce(() => recovering.promise)
      .mockImplementation(async () => server)
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('violates invoices_milestone_id_tenant_id_fkey'))
      .mockImplementation(async (_previous: AppState, next: AppState) => {
        server = next
      })
    setRepository({ load, save })
    await hydrateStore()
    updateTenantData((data) => ({ ...data, estimates: [] }))
    await vi.waitFor(() => expect(getSaveStatus().state).toBe('error'))
    const synchronization = synchronizeStoreSaves()
    updateTenantData((data) => ({ ...data, tenant: { ...data.tenant, phone: '123' } }))
    recovering.resolve(server)
    await synchronization
    expect(currentTenantData()?.tenant.phone).toBe('123')
    expect(currentTenantData()?.estimates).toHaveLength(1)
  })

  it('does not resolve synchronization until an in-flight save completes', async () => {
    const saving = deferred<AppState | undefined>()
    setRepository({ load: async () => initial(), save: () => saving.promise })
    await hydrateStore()
    updateTenantData((data) => ({ ...data, tenant: { ...data.tenant, name: 'Editado' } }))
    let finished = false
    const synchronization = synchronizeStoreSaves().then(() => {
      finished = true
    })
    await Promise.resolve()
    expect(finished).toBe(false)
    saving.resolve(undefined)
    await synchronization
    expect(finished).toBe(true)
  })

  it('rejects synchronization and ignores recovery results after a session change', async () => {
    const recovering = deferred<AppState>()
    const save = vi
      .fn()
      .mockRejectedValue(new Error('violates invoices_milestone_id_tenant_id_fkey'))
    const load = vi
      .fn()
      .mockResolvedValueOnce(billedState())
      .mockImplementationOnce(() => recovering.promise)
    setRepository({ load, save })
    await hydrateStore()
    updateTenantData((data) => ({ ...data, estimates: [] }))
    await vi.waitFor(() => expect(getSaveStatus().state).toBe('error'))
    const synchronization = synchronizeStoreSaves()
    setRepository({ load: async () => initial(), save: async () => undefined })
    await expect(synchronization).rejects.toThrow('sesión ha cambiado')
    expect(getSaveStatus()).toEqual({ state: 'saved' })
    await hydrateStore()
    recovering.resolve(billedState())
    await Promise.resolve()
    expect(currentTenantData()?.estimates).toEqual([])
    expect(save).toHaveBeenCalledOnce()
  })

  it('returns the actual synchronization error without dropping unsaved edits', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Sin conexión real'))
    setRepository({ load: async () => initial(), save })
    await hydrateStore()
    updateTenantData((data) => ({ ...data, tenant: { ...data.tenant, name: 'Pendiente' } }))
    await vi.waitFor(() => expect(getSaveStatus().state).toBe('error'))
    await expect(synchronizeStoreSaves()).rejects.toThrow('Sin conexión real')
    expect(currentTenantData()?.tenant.name).toBe('Pendiente')
    expect(save).toHaveBeenCalledTimes(2)
  })
})
