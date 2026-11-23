import { applyRate, lineTotal } from './money'
import type { Cents, Estimate, EstimateLine, LedgerEntry, Milestone } from './types'

export type EstimateTotals = {
  /** Sums by kind, after per-line discounts. */
  materialsCents: Cents
  laborCents: Cents
  otherCents: Cents
  /** Sum of lines before any discount. */
  grossCents: Cents
  /** Total taken off by per-line discounts. */
  lineDiscountCents: Cents
  /** Whole-estimate discount, applied after the per-line ones. */
  globalDiscountCents: Cents
  /** Taxable base after every discount. */
  subtotalCents: Cents
  vatCents: Cents
  totalCents: Cents
}

export type EstimateDiscount = { type: Estimate['discountType']; value: number }

export function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
}

/** Line amount after its own percentage discount. */
export function lineNetCents(line: EstimateLine): Cents {
  const gross = lineTotal(line.quantity, line.unitPriceCents)
  return gross - Math.round((gross * clampPercent(line.discountPercent)) / 100)
}

export function calculateTotals(
  lines: EstimateLine[],
  vatRate: number,
  discount: EstimateDiscount = { type: 'none', value: 0 },
): EstimateTotals {
  const sums = { material: 0, labor: 0, other: 0 }
  let grossCents = 0
  for (const line of lines) {
    sums[line.kind] += lineNetCents(line)
    grossCents += lineTotal(line.quantity, line.unitPriceCents)
  }
  const netCents = sums.material + sums.labor + sums.other
  const globalDiscountCents =
    discount.type === 'percent'
      ? Math.round((netCents * clampPercent(discount.value)) / 100)
      : discount.type === 'amount'
        ? Math.min(netCents, Math.max(0, Math.round(discount.value)))
        : 0
  const subtotalCents = netCents - globalDiscountCents
  const vatCents = applyRate(subtotalCents, vatRate)
  return {
    materialsCents: sums.material,
    laborCents: sums.labor,
    otherCents: sums.other,
    grossCents,
    lineDiscountCents: grossCents - netCents,
    globalDiscountCents,
    subtotalCents,
    vatCents,
    totalCents: subtotalCents + vatCents,
  }
}

export function estimateTotals(estimate: Estimate): EstimateTotals {
  const totals = calculateTotals(estimate.lines, estimate.vatRate, {
    type: estimate.discountType,
    value: estimate.discountValue,
  })
  const price =
    estimate.documentFormat === 'sections' &&
    estimate.sections?.find(
      (section) => section.type === 'prices' && section.grossCents !== undefined,
    )
  const line = estimate.lines[0]
  if (
    !price ||
    price.type !== 'prices' ||
    price.grossCents === undefined ||
    estimate.lines.length !== 1 ||
    price.lineIds.length !== 1 ||
    !line ||
    line.id !== price.lineIds[0] ||
    line.quantity !== 1 ||
    line.discountPercent !== 0 ||
    line.unitPriceCents !== Math.round(price.grossCents / (1 + estimate.vatRate / 100))
  )
    return totals
  const base = line.unitPriceCents
  const rounding = price.grossCents - base - applyRate(base, estimate.vatRate)
  const adjustment =
    base === 0
      ? 0
      : Math.sign(rounding) * Math.round((Math.abs(rounding) * totals.subtotalCents) / base)
  return {
    ...totals,
    vatCents: totals.vatCents + adjustment,
    totalCents: totals.totalCents + adjustment,
  }
}

export type MilestoneAmount = Milestone & { amountCents: Cents }

/** Splits the total across milestones; the last one absorbs rounding so the sum is exact. */
export function milestoneAmounts(milestones: Milestone[], totalCents: Cents): MilestoneAmount[] {
  let allocated = 0
  return milestones.map((milestone, index) => {
    const isLast = index === milestones.length - 1
    const amountCents = isLast
      ? totalCents - allocated
      : Math.round((totalCents * milestone.percent) / 100)
    allocated += amountCents
    return { ...milestone, amountCents }
  })
}

export function milestonePercentSum(milestones: Milestone[]): number {
  return milestones.reduce((sum, milestone) => sum + milestone.percent, 0)
}

/** A work estimate must describe the whole agreed price before it is published. */
export function paymentMilestonesError(estimate: Estimate): string | null {
  if (estimate.conversionDestination === 'contract') return null
  if (
    !estimate.milestones.length ||
    estimate.milestones.some(
      (milestone) =>
        !milestone.label.trim() ||
        !Number.isFinite(milestone.percent) ||
        milestone.percent < 0 ||
        milestone.percent > 100,
    ) ||
    Math.abs(milestonePercentSum(estimate.milestones) - 100) >= 0.001
  )
    return 'Indica los plazos de pago y comprueba que sus porcentajes sumen el 100 %.'
  const totalCents = estimateTotals(estimate).totalCents
  if (milestoneAmounts(estimate.milestones, totalCents).some(({ amountCents }) => amountCents < 0))
    return 'El reparto no se puede representar en céntimos. Ajusta los plazos de pago.'
  return null
}

export function defaultMilestones(depositPercent: number): Milestone[] {
  const rest = 100 - depositPercent
  const mid = Math.round(rest / 2)
  return [
    { id: 'm1', label: 'Señal a la aceptación', percent: depositPercent },
    { id: 'm2', label: 'Mitad de obra', percent: mid },
    { id: 'm3', label: 'Entrega final', percent: rest - mid },
  ]
}

export function formatEstimateNumber(sequence: number, year: number): string {
  return `P-${year}-${String(sequence).padStart(3, '0')}`
}

export function paidForEstimate(estimateId: string, ledger: LedgerEntry[]): Cents {
  return ledger
    .filter((entry) => entry.estimateId === estimateId && entry.kind === 'income')
    .reduce((sum, entry) => sum + entry.amountCents, 0)
}

export function estimateTotalCents(estimate: Estimate): Cents {
  return estimateTotals(estimate).totalCents
}

export function ledgerNetCents(entry: LedgerEntry): Cents {
  return entry.amountCents - ledgerVatCents(entry)
}

/** Ledger amounts are gross; VAT is extracted from them. */
export function ledgerVatCents(entry: LedgerEntry): Cents {
  const magnitude = Math.abs(entry.amountCents)
  const vat = Math.round(magnitude - magnitude / (1 + entry.vatRate / 100))
  return Math.sign(entry.amountCents) * vat
}
