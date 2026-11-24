import { z } from 'zod'

import { formLimits } from './form-limits.js'
import { parseEuros } from './money.js'
import type { LedgerVatLine } from './types.js'

const cents = z
  .number()
  .int()
  .nonnegative()
  .max(formLimits.monetaryAmount * 100)
export const ledgerVatLineSchema = z
  .object({
    rate: z
      .number()
      .finite()
      .min(0)
      .max(100)
      .refine((rate) => Math.abs(rate * 100 - Math.round(rate * 100)) < 0.000001),
    baseCents: cents,
    vatCents: cents,
  })
  .strict()
export const ledgerVatBreakdownSchema = z.array(ledgerVatLineSchema).min(1).max(20)

export type LedgerVatInput = { rate: string; base: string; vat: string }

/** Keep document VAT amounts instead of recomputing them from the gross total. */
export function parseLedgerVatBreakdown(
  lines: LedgerVatInput[],
  grossCents: number,
): LedgerVatLine[] | null {
  const money = /^(?:[0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+)(?:,[0-9]{1,2})?$|^[0-9]+\.[0-9]{1,2}$/
  if (
    !lines.length ||
    lines.some(
      (line) => !line.rate.trim() || !money.test(line.base.trim()) || !money.test(line.vat.trim()),
    )
  )
    return null
  const parsed = ledgerVatBreakdownSchema.safeParse(
    lines.map((line) => ({
      rate: Number(line.rate.replace(',', '.')),
      baseCents: parseEuros(line.base),
      vatCents: parseEuros(line.vat),
    })),
  )
  if (
    !parsed.success ||
    parsed.data.reduce((sum, line) => sum + line.baseCents + line.vatCents, 0) !== grossCents
  )
    return null
  return parsed.data
}
