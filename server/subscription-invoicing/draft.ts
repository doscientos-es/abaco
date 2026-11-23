import { z } from 'zod'

const fiscalParty = z.object({
  legal_name: z.string().trim().min(1).max(160),
  tax_id: z.string().regex(/^[A-Z0-9]{9}$/),
  street: z.string().trim().min(1).max(250),
  postal_code: z.string().regex(/^[0-9]{5}$/),
  city: z.string().trim().min(1).max(120),
  province: z.string().trim().min(1).max(120),
})

const recipient = fiscalParty.extend({ email: z.string().email().max(254) })
const payment = z.object({
  paymentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  order: z.string().regex(/^[0-9]{4}[A-Za-z0-9]{4,8}$/),
  paidAt: z.string().datetime({ offset: true }),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  plan: z.enum(['solo', 'team', 'business', 'scale']),
  interval: z.enum(['month', 'year']),
  netCents: z.number().int().positive().max(100_000_000),
  totalCents: z.number().int().positive().max(121_000_000),
  vatPercent: z.literal(21),
  recipient,
})

const issuer = fiscalParty.extend({
  series: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/),
})

export type SubscriptionInvoiceDraft = {
  paymentId: string
  tenantId: string
  order: string
  paidAt: string
  startsAt: string
  endsAt: string
  plan: 'solo' | 'team' | 'business' | 'scale'
  interval: 'month' | 'year'
  issuer: z.infer<typeof issuer>
  recipient: z.infer<typeof recipient>
  netCents: number
  vatCents: number
  vatPercent: 21
  totalCents: number
}

/**
 * Validates a server-side payment snapshot, without numbering or issuing an invoice.
 * The caller must load a settled payment and its captured recipient from trusted storage.
 */
export function prepareSubscriptionInvoiceDraft(
  paymentInput: unknown,
  issuerInput: unknown,
  now: Date,
): SubscriptionInvoiceDraft {
  const pay = payment.parse(paymentInput)
  const issuingParty = issuer.parse(issuerInput)
  const paidAt = Date.parse(pay.paidAt)
  const startsAt = Date.parse(pay.startsAt)
  const endsAt = Date.parse(pay.endsAt)
  const vatCents = Math.floor((pay.netCents * pay.vatPercent + 50) / 100)
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(paidAt) ||
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    paidAt > now.getTime() ||
    endsAt <= startsAt ||
    pay.totalCents !== pay.netCents + vatCents
  )
    throw new Error('El cobro o el periodo de suscripción no son válidos')

  return {
    paymentId: pay.paymentId,
    tenantId: pay.tenantId,
    order: pay.order,
    paidAt: pay.paidAt,
    startsAt: pay.startsAt,
    endsAt: pay.endsAt,
    plan: pay.plan,
    interval: pay.interval,
    issuer: issuingParty,
    recipient: pay.recipient,
    netCents: pay.netCents,
    vatCents,
    vatPercent: pay.vatPercent,
    totalCents: pay.totalCents,
  }
}
