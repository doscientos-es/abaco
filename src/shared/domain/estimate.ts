import { applyRate, lineTotal } from './money'
import type { Cents, Estimate, EstimateLine, LedgerEntry, Milestone } from './types'

export type EstimateTotals = {
  materialsCents: Cents
  laborCents: Cents
  otherCents: Cents
  subtotalCents: Cents
  vatCents: Cents
  totalCents: Cents
}

export function calculateTotals(lines: EstimateLine[], vatRate: number): EstimateTotals {
  const sums = { material: 0, labor: 0, other: 0 }
  for (const line of lines) sums[line.kind] += lineTotal(line.quantity, line.unitPriceCents)
  const subtotalCents = sums.material + sums.labor + sums.other
  const vatCents = applyRate(subtotalCents, vatRate)
  return {
    materialsCents: sums.material,
    laborCents: sums.labor,
    otherCents: sums.other,
    subtotalCents,
    vatCents,
    totalCents: subtotalCents + vatCents,
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
  return calculateTotals(estimate.lines, estimate.vatRate).totalCents
}

export function ledgerNetCents(entry: LedgerEntry): Cents {
  return entry.amountCents - ledgerVatCents(entry)
}

/** Ledger amounts are gross; VAT is extracted from them. */
export function ledgerVatCents(entry: LedgerEntry): Cents {
  return Math.round(entry.amountCents - entry.amountCents / (1 + entry.vatRate / 100))
}
