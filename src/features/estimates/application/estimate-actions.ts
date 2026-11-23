import { formatEstimateNumber } from '@/shared/domain/estimate'
import type { EstimateFormat } from '@/shared/domain/estimate-document'
import { estimateRemovalError } from '@/shared/domain/estimate-removal'
import type { Estimate, LedgerEntry, Milestone } from '@/shared/domain/types'
import { newId, updateTenantData } from '@/shared/store/store'

import { copyEstimateSections } from '../domain/estimate-sections'
import { buildEstimateDraft, newEstimateError } from '../domain/new-estimate'

export function createEstimate(
  clientId: string,
  title = 'Nuevo servicio',
  documentFormat: EstimateFormat = 'sections',
): string {
  let id = ''
  updateTenantData((data) => {
    const estimate = buildEstimateDraft(data.tenant, clientId, title, documentFormat, newId)
    id = estimate.id
    return {
      ...data,
      tenant: { ...data.tenant, nextEstimateNumber: data.tenant.nextEstimateNumber + 1 },
      estimates: [estimate, ...data.estimates],
    }
  })
  return id
}

/** Called once by the final submit, with the complete locally edited document. */
export function submitEstimateDraft(draft: Estimate): string {
  const error = newEstimateError(draft)
  if (error) throw new Error(error)
  updateTenantData((data) => {
    if (draft.tenantId !== data.tenant.id)
      throw new Error('La empresa activa ha cambiado. Vuelve a crear el presupuesto.')
    if (data.estimates.some((estimate) => estimate.id === draft.id)) return data
    if (!data.clients.some((client) => client.id === draft.clientId && !client.archivedAt))
      throw new Error('Selecciona un cliente activo.')
    const now = new Date()
    const estimate: Estimate = {
      ...draft,
      title: draft.title.trim(),
      status: 'draft',
      number: formatEstimateNumber(data.tenant.nextEstimateNumber, now.getFullYear()),
      createdAt: now.toISOString().slice(0, 10),
    }
    return {
      ...data,
      tenant: { ...data.tenant, nextEstimateNumber: data.tenant.nextEstimateNumber + 1 },
      estimates: [estimate, ...data.estimates],
    }
  })
  return draft.id
}

export function patchEstimate(id: string, patch: Partial<Estimate>): void {
  updateTenantData((data) => ({
    ...data,
    estimates: data.estimates.map((estimate) => {
      if (estimate.id !== id || estimate.status !== 'draft') return estimate
      const next = { ...estimate, ...patch }
      if (
        (next.conversionDestination ?? 'work') !== (estimate.conversionDestination ?? 'work') &&
        (data.invoices.some((invoice) => invoice.estimateId === id) ||
          data.ledger.some((entry) => entry.estimateId === id))
      ) {
        throw new Error('No se puede cambiar el tipo de un presupuesto con facturas o cobros.')
      }
      const error = estimateRemovalError(estimate, next, data.invoices)
      if (error) throw new Error(error)
      return next
    }),
  }))
}

export function deleteEstimate(id: string): void {
  updateTenantData((data) => {
    const estimate = data.estimates.find((item) => item.id === id)
    if (!estimate || estimate.status !== 'draft') return data
    const error = estimateRemovalError(estimate, undefined, data.invoices)
    if (error) throw new Error(error)
    return { ...data, estimates: data.estimates.filter((item) => item.id !== id) }
  })
}

export function duplicateEstimate(id: string): string | null {
  let created: string | null = null
  updateTenantData((data) => {
    const source = data.estimates.find((e) => e.id === id)
    if (!source) return data
    created = newId()
    // The copy gets its own public link from the database, and nobody has answered it yet.
    const {
      publicToken: _token,
      respondedAt: _at,
      respondedBy: _by,
      respondedSignature: _signature,
      emailSentAt: _emailSentAt,
      ...base
    } = source
    const lineIds = new Map<string, string>()
    const lines = source.lines.map((line) => {
      const copiedId = newId()
      lineIds.set(line.id, copiedId)
      return { ...line, id: copiedId }
    })
    const copy: Estimate = {
      ...base,
      id: created,
      number: formatEstimateNumber(data.tenant.nextEstimateNumber, new Date().getFullYear()),
      status: 'draft',
      conversionDestination: source.conversionDestination ?? 'work',
      automaticContract: source.conversionDestination === 'contract',
      contractBillingFrequency:
        source.conversionDestination === 'contract'
          ? (source.contractBillingFrequency ?? 'monthly')
          : 'once',
      createdAt: new Date().toISOString().slice(0, 10),
      // Fresh ids: rows are upserted by id, so reusing them would move the originals' children.
      lines,
      ...(source.sections
        ? { sections: copyEstimateSections(source.sections, lineIds, newId) }
        : {}),
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
