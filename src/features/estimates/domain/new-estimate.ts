import { companyEstimateDesign } from '@/shared/domain/document-library'
import { defaultMilestones, formatEstimateNumber } from '@/shared/domain/estimate'
import { estimateSectionsSchema, type EstimateFormat } from '@/shared/domain/estimate-document'
import { formLimits } from '@/shared/domain/form-limits'
import type { Estimate, Tenant } from '@/shared/domain/types'

import { createEstimateSection, requiredEstimateSectionsError } from './estimate-sections'

/** Preparing a form never reserves a number or writes to the store. */
export function buildEstimateDraft(
  tenant: Tenant,
  clientId: string,
  title: string,
  documentFormat: EstimateFormat,
  newId: () => string,
  now = new Date(),
): Estimate {
  return {
    id: newId(),
    tenantId: tenant.id,
    number: formatEstimateNumber(tenant.nextEstimateNumber, now.getFullYear()),
    clientId,
    title: title.trim() || 'Nuevo servicio',
    status: 'draft',
    documentFormat,
    documentDesign: companyEstimateDesign(tenant),
    sections:
      documentFormat === 'sections'
        ? [
            createEstimateSection('description', newId),
            createEstimateSection('work_table', newId),
            createEstimateSection('prices', newId),
          ]
        : [],
    conversionDestination: 'contract',
    automaticContract: true,
    contractBillingFrequency: 'monthly',
    lines: [],
    discountType: 'none',
    discountValue: 0,
    vatRate: tenant.defaultVatRate,
    milestones: defaultMilestones(tenant.defaultDepositPercent).map((item) => ({
      ...item,
      id: newId(),
    })),
    clauses:
      documentFormat === 'sections'
        ? ''
        : 'Validez de 30 días. Los cambios sobre lo presupuestado se facturan aparte. Los plazos dependen de la disponibilidad de materiales.',
    validUntil: new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10),
    createdAt: now.toISOString().slice(0, 10),
  }
}

export function newEstimateError(estimate: Estimate): string | null {
  const sectionsError = requiredEstimateSectionsError(estimate)
  if (sectionsError) return sectionsError
  if (!estimate.clientId) return 'Selecciona un cliente.'
  if (!estimate.title.trim() || estimate.title.trim().length > formLimits.estimateTitle)
    return 'Introduce un título válido para el presupuesto.'
  const validDate = new Date(`${estimate.validUntil}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(estimate.validUntil) ||
    !Number.isFinite(validDate.getTime()) ||
    validDate.toISOString().slice(0, 10) !== estimate.validUntil
  )
    return 'Introduce una fecha de validez válida.'
  if (!estimate.lines.length)
    return 'Añade al menos un precio o una partida antes de crear el presupuesto.'
  if (
    estimate.lines.some(
      (line) =>
        !line.description.trim() ||
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        !Number.isSafeInteger(line.unitPriceCents) ||
        line.unitPriceCents < 0,
    )
  )
    return 'Revisa la descripción, cantidad y precio de las partidas.'
  if (estimate.documentFormat === 'sections') {
    const parsed = estimateSectionsSchema.safeParse(estimate.sections)
    if (
      !parsed.success ||
      !parsed.data.length ||
      parsed.data.some((section) => !section.title.trim())
    )
      return 'Revisa el contenido de las secciones del presupuesto.'
    const referenced = new Set(
      parsed.data.flatMap((section) => (section.type === 'prices' ? section.lineIds : [])),
    )
    if (
      referenced.size !== estimate.lines.length ||
      estimate.lines.some((line) => !referenced.has(line.id))
    )
      return 'Revisa los precios de las secciones del presupuesto.'
  }
  return null
}
