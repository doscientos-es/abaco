import { z } from 'zod'

import { formLimits } from '@/shared/domain/form-limits'
import { centsToInput } from '@/shared/domain/money'
import type { Estimate, EstimateLine } from '@/shared/domain/types'

const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable()
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  })

/** Unrecognized values are null, never guessed. Amount is the gross amount including VAT. */
export const receiptSuggestionSchema = z
  .object({
    date: date.nullable(),
    concept: optionalText(formLimits.ledgerConcept),
    category: optionalText(formLimits.ledgerCategory),
    grossCents: z
      .number()
      .int()
      .positive()
      .max(formLimits.monetaryAmount * 100)
      .nullable(),
    vatRate: z.number().finite().min(0).max(100).nullable(),
  })
  .strict()

export type ReceiptSuggestion = z.infer<typeof receiptSuggestionSchema>
export type ReceiptFields = {
  date: string
  concept: string
  category: string
  amount: string
  vatRate: string
}

/** Applied only on user confirmation; missing values leave the current form untouched. */
export function applyReceiptSuggestion<T extends ReceiptFields>(
  form: T,
  suggestion: ReceiptSuggestion,
): T {
  return {
    ...form,
    date: suggestion.date ?? form.date,
    concept: suggestion.concept ?? form.concept,
    category: suggestion.category ?? form.category,
    amount: suggestion.grossCents === null ? form.amount : centsToInput(suggestion.grossCents),
    vatRate: suggestion.vatRate === null ? form.vatRate : String(suggestion.vatRate),
  }
}

const estimateLineSuggestionSchema = z
  .object({
    description: optionalText(formLimits.estimateLineDescription),
    details: optionalText(formLimits.estimateLineDetails),
    kind: z.enum(['material', 'labor', 'other']).nullable(),
    unit: optionalText(formLimits.unit),
    quantity: z.number().finite().positive().max(formLimits.quantity).nullable(),
    unitPriceCents: z
      .number()
      .int()
      .nonnegative()
      .max(formLimits.monetaryAmount * 100)
      .nullable(),
  })
  .strict()

export const estimateSuggestionSchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    lines: z.array(estimateLineSuggestionSchema).max(50),
  })
  .strict()

export type EstimateSuggestion = z.infer<typeof estimateSuggestionSchema>

type CompleteLine = z.infer<typeof estimateLineSuggestionSchema> & {
  description: string
  kind: EstimateLine['kind']
  unit: string
  quantity: number
  unitPriceCents: number
}

export function isCompleteEstimateSuggestion(
  line: EstimateSuggestion['lines'][number],
): line is CompleteLine {
  return (
    line.description !== null &&
    line.kind !== null &&
    line.unit !== null &&
    line.quantity !== null &&
    line.unitPriceCents !== null
  )
}

/** Append complete suggestions without replacing manually entered prices or inventing missing values. */
export function appendEstimateSuggestion(
  estimate: Estimate,
  suggestion: EstimateSuggestion,
  newId: () => string,
): { patch: Partial<Estimate>; incomplete: number } {
  const complete = suggestion.lines.filter(isCompleteEstimateSuggestion)
  const incomplete = suggestion.lines.length - complete.length
  const prices = estimate.sections?.filter((section) => section.type === 'prices') ?? []
  if (
    !complete.length ||
    estimate.lines.length + complete.length > 500 ||
    (estimate.documentFormat === 'sections' && prices.length !== 1)
  ) {
    return { patch: {}, incomplete }
  }
  const lines: EstimateLine[] = complete.map((line) => ({
    id: newId(),
    catalogItemId: null,
    description: line.description,
    ...(line.details === null ? {} : { details: line.details }),
    kind: line.kind,
    unit: line.unit,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    discountPercent: 0,
  }))
  return {
    patch: {
      lines: [...estimate.lines, ...lines],
      ...(estimate.documentFormat === 'sections'
        ? {
            sections: (estimate.sections ?? []).map((section) =>
              section.type === 'prices'
                ? { ...section, lineIds: [...section.lineIds, ...lines.map((line) => line.id)] }
                : section,
            ),
          }
        : {}),
    },
    incomplete,
  }
}
