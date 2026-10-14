import { defaultMilestones, formatEstimateNumber } from '@/shared/domain/estimate'
import type { Estimate, LedgerEntry, Milestone } from '@/shared/domain/types'
import { newId, updateTenantData } from '@/shared/store/store'

export function createEstimate(clientId: string, title = 'Nueva reforma'): string {
  const id = newId()
  updateTenantData((data) => {
    const now = new Date()
    const validUntil = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)
    const estimate: Estimate = {
      id,
      tenantId: data.tenant.id,
      number: formatEstimateNumber(data.tenant.nextEstimateNumber, now.getFullYear()),
      clientId,
      title: title.trim() || 'Nueva reforma',
      status: 'draft',
      lines: [],
      discountType: 'none',
      discountValue: 0,
      vatRate: data.tenant.defaultVatRate,
      milestones: defaultMilestones(data.tenant.defaultDepositPercent),
      clauses:
        'Validez de 30 días. Los cambios sobre lo presupuestado se facturan aparte. Los plazos dependen de la disponibilidad de materiales.',
      validUntil,
      createdAt: now.toISOString().slice(0, 10),
    }
    return {
      ...data,
      tenant: { ...data.tenant, nextEstimateNumber: data.tenant.nextEstimateNumber + 1 },
      estimates: [estimate, ...data.estimates],
    }
  })
  return id
}

export function patchEstimate(id: string, patch: Partial<Estimate>): void {
  updateTenantData((data) => ({
    ...data,
    estimates: data.estimates.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }))
}

export function deleteEstimate(id: string): void {
  updateTenantData((data) => ({
    ...data,
    estimates: data.estimates.filter((e) => e.id !== id),
  }))
}

export function duplicateEstimate(id: string): string | null {
  let created: string | null = null
  updateTenantData((data) => {
    const source = data.estimates.find((e) => e.id === id)
    if (!source) return data
    created = newId()
    // The copy gets its own public link from the database, and nobody has answered it yet.
    const { publicToken: _token, respondedAt: _at, respondedBy: _by, ...base } = source
    const copy: Estimate = {
      ...base,
      id: created,
      number: formatEstimateNumber(data.tenant.nextEstimateNumber, new Date().getFullYear()),
      status: 'draft',
      createdAt: new Date().toISOString().slice(0, 10),
      // Fresh ids: rows are upserted by id, so reusing them would move the originals' children.
      lines: source.lines.map((l) => ({ ...l, id: newId() })),
      milestones: source.milestones.map((m) => ({ ...m, id: newId() })),
    }
    return {
      ...data,
      tenant: { ...data.tenant, nextEstimateNumber: data.tenant.nextEstimateNumber + 1 },
      estimates: [copy, ...data.estimates],
    }
  })
  return created
}

/** Records a milestone payment as an income entry linked to the estimate. */
export function registerMilestonePayment(
  estimate: Estimate,
  milestone: Milestone,
  amountCents: number,
): void {
  updateTenantData((data) => {
    const entry: LedgerEntry = {
      id: newId(),
      tenantId: data.tenant.id,
      kind: 'income',
      date: new Date().toISOString().slice(0, 10),
      concept: `${estimate.number} · ${milestone.label}`,
      category: 'Cobro de presupuesto',
      amountCents,
      vatRate: estimate.vatRate,
      estimateId: estimate.id,
      milestoneId: milestone.id,
    }
    return { ...data, ledger: [entry, ...data.ledger] }
  })
}
