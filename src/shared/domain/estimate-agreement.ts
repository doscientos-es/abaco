import { z } from 'zod'

import { servicePeriodicitiesSchema } from './service-periodicity'

const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Immutable commercial terms, separate from document prose and operational scheduling. */
export const estimateAgreementSchema = z.object({
  version: z.literal(1),
  currency: z.literal('EUR'),
  estimateId: z.string().uuid(),
  price: z.object({
    billingFrequency: z.enum(['once', 'monthly', 'quarterly', 'yearly']),
    netCents: cents,
    vatRate: z.number().min(0).max(100),
    vatCents: cents,
    totalCents: cents,
  }),
  services: z.array(
    z.object({
      id: z.string().uuid(),
      sectionId: z.string().uuid().nullable(),
      sourceLineId: z.string().uuid().nullable(),
      task: z.string(),
      /** As quoted; never interpreted as the billing frequency or an executable schedule. */
      frequency: z.string(),
      notes: z.string(),
      periodicities: servicePeriodicitiesSchema.optional(),
    }),
  ),
})

export type EstimateAgreement = z.infer<typeof estimateAgreementSchema>
