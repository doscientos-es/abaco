import { Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'

import {
  estimateTotals,
  milestoneAmounts,
  milestonePercentSum,
  paidForEstimate,
} from '@/shared/domain/estimate'
import type { Estimate, LedgerEntry } from '@/shared/domain/types'

import { MilestonesEditor } from './milestones-editor'

export function EstimatePaymentMilestones({
  estimate,
  ledger,
  readOnly = false,
}: {
  estimate: Estimate
  ledger: LedgerEntry[]
  readOnly?: boolean
}) {
  if (estimate.conversionDestination === 'contract') return null
  const { totalCents } = estimateTotals(estimate)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hitos de pago</CardTitle>
      </CardHeader>
      <CardContent>
        <MilestonesEditor
          estimate={estimate}
          amounts={milestoneAmounts(estimate.milestones, totalCents)}
          percentSum={milestonePercentSum(estimate.milestones)}
          paidCents={paidForEstimate(estimate.id, ledger)}
          totalCents={totalCents}
          ledger={ledger}
          readOnly={readOnly}
        />
      </CardContent>
    </Card>
  )
}
