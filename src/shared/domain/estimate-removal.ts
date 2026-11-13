import type { Estimate, Invoice } from './types'

export const invoicedMilestoneRemovalMessage =
  'No se puede eliminar un hito con facturas emitidas. Conserva el hito o crea una copia del presupuesto.'
export const invoicedEstimateRemovalMessage =
  'No se puede eliminar un presupuesto con facturas emitidas. Conserva el original o crea una copia.'

/** Issued invoices keep their original estimate and milestone, even on legacy drafts. */
export function estimateRemovalError(
  before: Estimate,
  after: Estimate | undefined,
  invoices: readonly Invoice[],
): string | null {
  const linked = invoices.filter(
    (invoice) => invoice.tenantId === before.tenantId && invoice.estimateId === before.id,
  )
  if (!after) return linked.length ? invoicedEstimateRemovalMessage : null
  const retained = new Set(after.milestones.map((milestone) => milestone.id))
  const removed = new Set(
    before.milestones
      .filter((milestone) => !retained.has(milestone.id))
      .map((milestone) => milestone.id),
  )
  return linked.some((invoice) => invoice.milestoneId && removed.has(invoice.milestoneId))
    ? invoicedMilestoneRemovalMessage
    : null
}
