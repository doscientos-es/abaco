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
    second.resolve(undefined)
    await vi.waitFor(() => expect(getSaveStatus().state).toBe('saved'))
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
})
