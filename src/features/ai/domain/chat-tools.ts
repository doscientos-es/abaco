import { z } from 'zod'

import { formLimits } from '../../../shared/domain/form-limits.js'
import { estimateSuggestionSchema } from './suggestions.js'

export const searchRecordsSchema = z.object({
  type: z.enum(['clientes', 'presupuestos']),
  query: z.string().trim().max(formLimits.searchQuery),
})

export const clientProposalSchema = z.object({
  name: z.string().trim().min(1).max(formLimits.clientName),
  taxId: z.string().max(formLimits.taxId).nullable(),
  email: z.string().max(formLimits.email).nullable(),
  phone: z.string().max(formLimits.phone).nullable(),
  address: z.string().max(formLimits.address).nullable(),
})

export const estimateProposalSchema = estimateSuggestionSchema

export const estimateDraftProposalSchema = z
  .object({
    title: z.string().trim().max(formLimits.estimateTitle).nullable(),
    clientId: z.string().uuid().nullable(),
    suggestion: estimateSuggestionSchema,
  })
  .strict()

export type ClientProposal = z.infer<typeof clientProposalSchema>
