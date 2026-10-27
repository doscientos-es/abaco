import { useSyncExternalStore } from 'react'

import type { TenantData } from '../domain/types'

/** Repository operations are serialized; an adapter may return server-assigned values. */
export type TenantRepository = {
  load(): Promise<AppState>
  save(previous: AppState, next: AppState): Promise<AppState | undefined>
}

export type AppState = {
  activeTenantId: string
  tenants: Record<string, TenantData>
}

export type SaveStatus = { state: 'saved' | 'saving' | 'error'; message?: string }

type PendingChange = { previous: AppState; next: AppState; epoch: number }

const unconfigured: TenantRepository = {
  load: () => Promise.reject(new Error('El almacén de datos no está configurado.')),
  save: () => Promise.reject(new Error('El almacén de datos no está configurado.')),
}

let repository: TenantRepository = unconfigured
let state: AppState | undefined
let hydration: Promise<void> | undefined
let epoch = 0
let revision = 0
let drainingEpoch: number | null = null
let needsReload = false
let queue: PendingChange[] = []
let saveStatus: SaveStatus = { state: 'saved' }
const listeners = new Set<() => void>()
const statusListeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function setSaveStatus(next: SaveStatus) {
  saveStatus = next
  for (const listener of statusListeners) listener()
}

/** Chooses the data source. Call before hydrateStore. */
export function setRepository(next: TenantRepository): void {
  epoch += 1
  repository = next
  state = undefined
  hydration = undefined
  queue = []
  needsReload = false
  setSaveStatus({ state: 'saved' })
}

/** Invalidates in-flight responses and queued writes when the identity changes. */
export function resetStore(): void {
  epoch += 1
  hydration = undefined
  queue = []
  needsReload = false
  setSaveStatus({ state: 'saved' })
}

/** Routes await this before rendering screens that read the store synchronously. */
export function hydrateStore(): Promise<void> {
  if (hydration) return hydration
  const startedIn = epoch
  const pending = repository.load().then((loaded) => {
    if (startedIn !== epoch) return
    state = loaded
    revision += 1
    emit()
  })
  hydration = pending.catch((error: unknown) => {
    if (startedIn === epoch) hydration = undefined
    throw error
  })
  return hydration
}

/** The active company is a view choice, never persisted as part of a mutation. */
export function setActiveTenantId(id: string): void {
  if (!state || state.activeTenantId === id || !state.tenants[id]) return
  state = { ...state, activeTenantId: id }
  revision += 1
  emit()
}

/** A reload only applies if the session, local edits and active company are still current. */
export async function refreshStore(): Promise<void> {
  if (!state || queue.length || drainingEpoch === epoch) return
  const startedIn = epoch
  const startedAt = revision
  const selected = state.activeTenantId
  try {
    const loaded = await repository.load()
    if (startedIn !== epoch || startedAt !== revision || queue.length || drainingEpoch === epoch)
      return
    state = {
      ...loaded,
      activeTenantId: loaded.tenants[selected] ? selected : loaded.activeTenantId,
    }
    revision += 1
    emit()
  } catch {
    // A background refresh never discards data already on screen.
  }
}

function current(): AppState {
  if (!state) throw new Error('Los datos todavía no se han cargado.')
  return state
}

/**
 * A failed write stays in the queue with its original ids. Retrying cannot silently discard edits.
 * A server reload runs only after every queued write succeeds and no newer edit has appeared.
 */
async function drainQueue(): Promise<void> {
  if (drainingEpoch === epoch || saveStatus.state === 'error') return
  drainingEpoch = epoch
  const startedIn = epoch
  try {
    while (queue.length && startedIn === epoch) {
      const change = queue[0]
      if (!change || change.epoch !== epoch) break
      try {
        const fresh = await repository.save(change.previous, change.next)
        if (startedIn !== epoch) return
        queue.shift()
        needsReload ||= Boolean(fresh)
      } catch (error) {
        if (startedIn !== epoch) return
        setSaveStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'No se pudo guardar el cambio.',
        })
        return
      }
    }
    if (startedIn !== epoch || queue.length) return
    if (needsReload && state) {
      const startedAt = revision
      const selected = state.activeTenantId
      try {
        const loaded = await repository.load()
        if (startedIn !== epoch) return
        if (startedAt === revision && queue.length === 0) {
          state = {
            ...loaded,
            activeTenantId: loaded.tenants[selected] ? selected : loaded.activeTenantId,
          }
          revision += 1
          emit()
          needsReload = false
        }
      } catch (error) {
        if (startedIn !== epoch) return
        setSaveStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'No se pudo comprobar el guardado.',
        })
        return
      }
    }
    if (startedIn === epoch && queue.length === 0) setSaveStatus({ state: 'saved' })
  } finally {
    if (drainingEpoch === startedIn) drainingEpoch = null
    if (startedIn === epoch && queue.length && getSaveStatus().state !== 'error') void drainQueue()
  }
}

/** Retries the same pending changes after a recoverable network or server error. */
export function retryStoreSaves(): void {
  if (saveStatus.state !== 'error') return
  setSaveStatus({ state: 'saving' })
  void drainQueue()
}

export function updateState(mutator: (draft: AppState) => AppState): void {
  const previous = current()
  const next = mutator(previous)
  if (next === previous) return
  state = next
  revision += 1
  emit()
  queue.push({ previous, next, epoch })
  if (saveStatus.state !== 'error') {
    setSaveStatus({ state: 'saving' })
    void drainQueue()
  }
}

export function updateTenantData(mutator: (data: TenantData) => TenantData): void {
  updateState((s) => {
    const tenantId = s.activeTenantId
    const data = s.tenants[tenantId]
    if (!data) return s
    const next = mutator(data)
    if (next === data) return s
    return { ...s, tenants: { ...s.tenants, [tenantId]: next } }
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    subscribeStatus,
    () => saveStatus,
    () => saveStatus,
  )
}

export function getSaveStatus(): SaveStatus {
  return saveStatus
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, current, current)
}

export function useTenantData(): TenantData {
  const app = useAppState()
  const data = app.tenants[app.activeTenantId]
  if (!data) throw new Error('No hay ninguna empresa configurada.')
  return data
}

export function currentTenantData(): TenantData | undefined {
  if (!state) return undefined
  return state.tenants[state.activeTenantId]
}

export function newId(): string {
  return crypto.randomUUID()
}
