import { useSyncExternalStore } from 'react'

import type { TenantData } from '../domain/types'
import { seedTenant } from './seed'

/**
 * Repository port. localStorage backs demo mode; the Supabase adapter
 * (supabase-repository.ts) backs real sessions, filtered by RLS.
 * `save` receives the previous and next state so adapters can write only the differences.
 * It may return a fresh state when the server changed data (e.g. assigned document numbers).
 */
export type TenantRepository = {
  load(): Promise<AppState>
  save(previous: AppState, next: AppState): Promise<AppState | undefined>
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
        return Promise.resolve(parsed)
      }
    } catch {
      // Corrupted storage falls back to demo data.
    }
    return Promise.resolve(initialState())
  },
  save(_previous, next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return Promise.resolve(undefined)
  },
}

let repository: TenantRepository = localStorageRepository
let state: AppState | undefined
let hydration: Promise<void> | undefined
/** Saves run one after another so the server sees changes in the order they were made. */
let saveQueue: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()

/** Chooses the data source. Call before `hydrateStore`; clears any loaded data. */
export function setRepository(next: TenantRepository): void {
  repository = next
  resetStore()
}

/** Forgets loaded data (sign-out or source change). The next `hydrateStore` loads again. */
export function resetStore(): void {
  state = undefined
  hydration = undefined
  emit()
}

/** Loads data once. Routes await this in `beforeLoad` so components can read the store synchronously. */
export function hydrateStore(): Promise<void> {
  hydration ??= repository
    .load()
    .then((loaded) => {
      state = loaded
      emit()
    })
    .catch((error: unknown) => {
      hydration = undefined
      throw error
    })
  return hydration
}

function current(): AppState {
  if (!state) throw new Error('Los datos todavía no se han cargado.')
  return state
}

function emit() {
  for (const listener of listeners) listener()
}

export function updateState(mutator: (draft: AppState) => AppState): void {
  const previous = current()
  const next = mutator(previous)
  if (next === previous) return
  // Optimistic: the UI updates now; a failed save rolls back to what the source holds.
  state = next
  emit()
  saveQueue = saveQueue
    .then(() => repository.save(previous, next))
    .then((fresh) => {
      if (!fresh) return
      state = fresh
      emit()
    })
    .catch(async (error: unknown) => {
      console.error('No se pudo guardar el cambio; se recargan los datos.', error)
      state = await repository.load()
      emit()
    })
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

/** Ids are uuid so the same value works in localStorage and as a Postgres uuid primary key. */
export function newId(): string {
  return crypto.randomUUID()
}
