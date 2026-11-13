import {
  invoicedEstimateRemovalMessage,
  invoicedMilestoneRemovalMessage,
} from '../domain/estimate-removal'
import type { Estimate, TenantData } from '../domain/types'
import type { AppState } from './store'

type Change = { previous: AppState; next: AppState }
type RecordWithId = Record<string, unknown> & { id: string }
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const rows = (value: unknown): value is RecordWithId[] =>
  Array.isArray(value) && value.every((item) => object(item) && typeof item.id === 'string')

export function isInvoicedRemovalFailure(message = ''): boolean {
  return (
    message.includes(invoicedEstimateRemovalMessage) ||
    message.includes(invoicedMilestoneRemovalMessage) ||
    message.includes('invoices_milestone_id_tenant_id_fkey') ||
    message.includes('invoices_estimate_id_tenant_id_fkey')
  )
}

/** Replay only local differences; unchanged fields and concurrent server rows stay intact. */
function rebase(before: unknown, after: unknown, server: unknown): unknown {
  if (equal(before, after)) return server
  if (rows(before) && rows(after) && rows(server)) {
    const original = new Map(before.map((row) => [row.id, row]))
    const desired = new Set(after.map((row) => row.id))
    const merged = new Map(server.map((row) => [row.id, row]))
    for (const row of before) if (!desired.has(row.id)) merged.delete(row.id)
    for (const row of after) {
      const old = original.get(row.id)
      if (equal(old, row)) continue
      if (old && !merged.has(row.id))
        throw new Error(
          'Un registro editado ya no existe en el servidor. Los cambios pendientes se conservan.',
        )
      merged.set(row.id, rebase(old ?? {}, row, merged.get(row.id) ?? {}) as RecordWithId)
    }
    const order = equal(
      before.map((row) => row.id),
      after.map((row) => row.id),
    )
      ? [...server, ...after]
      : [...after, ...server]
    return [...new Set(order.map((row) => row.id))].flatMap((id) => {
      const row = merged.get(id)
      return row ? [row] : []
    })
  }
  if (object(before) && object(after) && object(server)) {
    const merged = { ...server }
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (equal(before[key], after[key])) continue
      if (!(key in after)) delete merged[key]
      else merged[key] = rebase(before[key], after[key], server[key])
    }
    return merged
  }
  return after
}

function includingMissing<T extends { id: string }>(
  current: T[],
  previous: T[],
  required?: ReadonlySet<string | null>,
): T[] {
  const ids = new Set(current.map((row) => row.id))
  const restored = [...current]
  previous.forEach((row, index) => {
    if (ids.has(row.id) || (required && !required.has(row.id))) return
    restored.splice(Math.min(index, restored.length), 0, row)
    ids.add(row.id)
  })
  return restored
}

function restoreSources(before: TenantData, after: TenantData, server: TenantData): TenantData {
  const invoices = [...before.invoices, ...server.invoices]
  const estimates = [...after.estimates]
  for (const original of before.estimates) {
    const linked = invoices.filter(
      (invoice) => invoice.tenantId === original.tenantId && invoice.estimateId === original.id,
    )
    if (!linked.length) continue
    const index = estimates.findIndex((estimate) => estimate.id === original.id)
    const saved = server.estimates.find((estimate) => estimate.id === original.id)
    if (index < 0) {
      // Older adapters could delete children before the milestone FK rejected the parent removal.
      const source = saved ?? original
      const restored: Estimate = {
        ...source,
        lines: includingMissing(source.lines, original.lines),
        milestones: includingMissing(source.milestones, original.milestones),
      }
      estimates.splice(Math.min(before.estimates.indexOf(original), estimates.length), 0, restored)
      continue
    }
    const estimate = estimates[index]
    if (!estimate) continue
    const billed = new Set(linked.map((invoice) => invoice.milestoneId))
    const source = includingMissing(saved?.milestones ?? [], original.milestones)
    estimates[index] = {
      ...estimate,
      milestones: includingMissing(estimate.milestones, source, billed),
    }
  }
  return { ...after, estimates }
}

/** Undo only prohibited removals and preserve every other queued edit, in its original order. */
export function recoverInvoicedRemovals(changes: readonly Change[], server: AppState): Change[] {
  let cursor = server
  return changes.map((change) => {
    for (const [id, tenant] of Object.entries(change.next.tenants)) {
      if (!cursor.tenants[id] && !equal(change.previous.tenants[id], tenant))
        throw new Error('La empresa ya no está disponible. Los cambios pendientes se conservan.')
    }
    const next = rebase(change.previous, change.next, cursor) as AppState
    const tenants = { ...next.tenants }
    for (const [id, before] of Object.entries(change.previous.tenants)) {
      const after = tenants[id]
      const saved = cursor.tenants[id]
      if (after && saved) tenants[id] = restoreSources(before, after, saved)
    }
    const corrected = { ...next, tenants }
    const repaired = { previous: cursor, next: corrected }
    cursor = corrected
    return repaired
  })
}
