export type VisitReportGate = 'missing' | 'unreviewed' | 'reviewed'

export function indexVisitReportGates(
  versions: ReadonlyArray<{ id: string; visit_id: string; version: number }>,
  reviewedIds: ReadonlySet<string>,
): Map<string, VisitReportGate> {
  const latest = new Map<string, (typeof versions)[number]>()
  for (const version of versions) {
    const prior = latest.get(version.visit_id)
    if (!prior || prior.version < version.version) latest.set(version.visit_id, version)
  }
  return new Map(
    [...latest.values()].map((version) => [
      version.visit_id,
      reviewedIds.has(version.id) ? 'reviewed' : 'unreviewed',
    ]),
  )
}

export const billingQueueCategories = ['decision', 'evidence', 'amount'] as const
export type BillingQueueCategory = (typeof billingQueueCategories)[number]

export function visitBillingQueueCategory(review: {
  status: 'pending' | 'included' | 'bill_separately'
  reportGate: VisitReportGate
}): BillingQueueCategory {
  if (review.reportGate !== 'reviewed') return 'evidence'
  return review.status === 'bill_separately' ? 'amount' : 'decision'
}
