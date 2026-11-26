import { z } from 'zod'

import { formLimits } from '../../../shared/domain/form-limits.js'
import type { Estimate } from '../../../shared/domain/types.js'
import { estimateSuggestionSchema } from './suggestions.js'

export const searchRecordsSchema = z.object({
  type: z.enum(['clientes', 'presupuestos', 'inventario']),
  query: z.string().trim().max(formLimits.searchQuery),
  recordId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected']).nullable().optional(),
})

export const clientProposalSchema = z.object({
  name: z.string().trim().min(1).max(formLimits.clientName),
  taxId: z.string().max(formLimits.taxId).nullable(),
  email: z.string().max(formLimits.email).nullable(),
  phone: z.string().max(formLimits.phone).nullable(),
  address: z.string().max(formLimits.address).nullable(),
})

// Tool arguments arrive incrementally and may contain an unfinished name.
export const clientProposalProgressSchema = clientProposalSchema.partial().extend({
  name: z.string().max(formLimits.clientName).optional(),
})

export const clientEditProposalSchema = clientProposalSchema.extend({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(formLimits.clientName).nullable(),
})

export const inventoryProposalSchema = z.object({
  catalogItemId: z.string().uuid(),
  quantity: z.number().finite().min(0).max(999999999.999).multipleOf(0.001),
})

export const estimateLineEditSchema = z.object({
  estimateId: z.string().uuid(),
  lineId: z.string().uuid(),
  description: z.string().trim().min(1).max(formLimits.estimateLineDescription).nullable(),
  quantity: z.number().finite().positive().max(formLimits.quantity).nullable(),
  unit: z.string().trim().min(1).max(formLimits.unit).nullable(),
  unitPriceCents: z
    .number()
    .int()
    .nonnegative()
    .max(formLimits.monetaryAmount * 100)
    .nullable(),
})

export function applyEstimateLineEdit(
  estimate: Estimate,
  proposal: z.infer<typeof estimateLineEditSchema>,
): Partial<Estimate> | null {
  if (estimate.id !== proposal.estimateId || estimate.status !== 'draft') return null
  const line = estimate.lines.find((item) => item.id === proposal.lineId)
  if (!line) return null
  const updated = {
    ...line,
    description: proposal.description ?? line.description,
    quantity: proposal.quantity ?? line.quantity,
    unit: proposal.unit ?? line.unit,
    unitPriceCents: proposal.unitPriceCents ?? line.unitPriceCents,
  }
  if (JSON.stringify(updated) === JSON.stringify(line)) return null
  return { lines: estimate.lines.map((item) => (item.id === line.id ? updated : item)) }
}

export const estimateProposalSchema = estimateSuggestionSchema

export const estimateDraftProposalSchema = z
  .object({
    title: z.string().trim().max(formLimits.estimateTitle).nullable(),
    clientId: z.string().uuid().nullable(),
    suggestion: estimateSuggestionSchema,
  })
  .strict()

export type ClientProposal = z.infer<typeof clientProposalSchema>
export type ClientProposalProgress = z.infer<typeof clientProposalProgressSchema>
