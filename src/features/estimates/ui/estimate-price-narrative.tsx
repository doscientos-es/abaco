import type { ContractBillingFrequency } from '@/shared/domain/contract-billing'

import { sectionPriceNarrative } from '../domain/estimate-section-price'

export function EstimatePriceNarrative({
  amountCents,
  frequency,
}: {
  amountCents: number
  frequency: ContractBillingFrequency
}) {
  const copy = sectionPriceNarrative(amountCents, frequency)
  return (
    <>
      <h3 className="mb-3 border-b pb-2 text-base font-semibold">{copy.heading}</h3>
      <p>{copy.body}</p>
    </>
  )
}
