import { useSyncExternalStore } from 'react'

import type { TenantData } from '../domain/types'

/**
 * Repository port. The Supabase adapter (supabase-repository.ts) is the only implementation,
 * filtered by RLS; `setRepository` must be called at startup.
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

const unconfigured: TenantRepository = {
  load: () => Promise.reject(new Error('El almacén de datos no está configurado.')),
  save: () => Promise.reject(new Error('El almacén de datos no está configurado.')),
}

let repository: TenantRepository = unconfigured
let state: AppState | undefined
let hydration: Promise<void> | undefined
/** Saves run one after another so the server sees changes in the order they were made. */
let saveQueue: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()

/** Chooses the data source. Call before `hydrateStore`; clears any loaded data. */
export function setRepository(next: TenantRepository): void {
  repository = next
  state = undefined
  hydration = undefined
}

/**
 * Marks the data as outdated (sign-out, new company). The next `hydrateStore` loads again and
 * replaces it. The old data stays only until then: screens still mounted must not lose it mid-render,
 * and the root route does not show them without a session.
 */
export function resetStore(): void {
  hydration = undefined
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

/** Points the app at one of the loaded companies. Not saved: it is a view choice, not data. */
export function setActiveTenantId(id: string): void {
  if (!state || state.activeTenantId === id || !state.tenants[id]) return
  state = { ...state, activeTenantId: id }
  emit()
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
      // oxlint-disable-next-line no-console -- no error UI yet; this is the only trace of a failed save
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

/** Ids are uuid so the client can create rows with their final Postgres uuid primary key. */
export function newId(): string {
  return crypto.randomUUID()
}
