import { useSyncExternalStore } from 'react'

import type { TenantData } from '../domain/types'
import { seedTenant } from './seed'

/**
 * Repository port. Today it is backed by localStorage; to move to Supabase,
 * implement this interface with queries filtered by tenant_id (RLS enforces it).
 */
export type TenantRepository = {
  load(): AppState
  save(state: AppState): void
}

export type AppState = {
  activeTenantId: string
  tenants: Record<string, TenantData>
}

const STORAGE_KEY = 'abderrahim-presupuestos:v1'

function initialState(): AppState {
  const a = seedTenant('tenant-reformas', 'Reformas Abderrahim', 'B12345678')
  const b = seedTenant('tenant-demo', 'Construcciones Demo', 'B87654321')
  return { activeTenantId: a.tenant.id, tenants: { [a.tenant.id]: a, [b.tenant.id]: b } }
}

export const localStorageRepository: TenantRepository = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as AppState
        // Data saved before invoices existed has no `invoices` list.
        for (const data of Object.values(parsed.tenants)) data.invoices ??= []
        return parsed
      }
    } catch {
      // Corrupted storage falls back to demo data.
    }
    return initialState()
  },
  save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  },
}

let repository: TenantRepository = localStorageRepository
let state: AppState | undefined
const listeners = new Set<() => void>()

export function setRepository(next: TenantRepository): void {
  repository = next
  state = undefined
  emit()
}

function current(): AppState {
  state ??= repository.load()
  return state
}

function emit() {
  for (const listener of listeners) listener()
}

export function updateState(mutator: (draft: AppState) => AppState): void {
  state = mutator(current())
  repository.save(state)
  emit()
}

export function updateTenantData(mutator: (data: TenantData) => TenantData): void {
  updateState((s) => {
    const data = s.tenants[s.activeTenantId]
    if (!data) return s
    return { ...s, tenants: { ...s.tenants, [s.activeTenantId]: mutator(data) } }
  })
}

export function resetDemoData(): void {
  updateState(() => initialState())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, current, current)
}

/** Data of the active tenant. Components never see other tenants' rows. */
export function useTenantData(): TenantData {
  const app = useAppState()
  const data = app.tenants[app.activeTenantId] ?? Object.values(app.tenants)[0]
  if (!data) throw new Error('No hay ninguna empresa configurada.')
  return data
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}
