export type WorkProfitabilitySummary = {
  actualCostCents: number
  activeCostCount: number
  allocatedExpenseNetCents?: number
  expenseAllocationCount?: number
  approvedExtraSaleCents: number
  billedNetCents: number
  billedGrossCents: number
  collectedGrossCents: number
  invoiceCount: number
}

export function workProfitability(
  acceptedNetCents: number | null,
  summary: WorkProfitabilitySummary,
) {
  const saleNetCents =
    acceptedNetCents === null ? null : acceptedNetCents + summary.approvedExtraSaleCents
  // An unrecorded cost is unknown, never a zero-cost job.
  const recordedCostCents = summary.activeCostCount > 0 ? summary.actualCostCents : null
  const billedMarginCents =
    recordedCostCents === null || summary.invoiceCount === 0
      ? null
      : summary.billedNetCents - recordedCostCents
  return {
    saleNetCents,
    recordedCostCents,
    billedMarginCents,
    billedMarginPercent:
      billedMarginCents === null || summary.billedNetCents <= 0
        ? null
        : (billedMarginCents / summary.billedNetCents) * 100,
    costDataIncomplete: true,
  }
}
