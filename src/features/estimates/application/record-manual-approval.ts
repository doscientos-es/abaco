import type { EstimateStatus } from '@/shared/domain/types'

import { acceptEstimateManually, publishEstimate } from './estimate-publication-actions'

export async function recordManualApproval(input: {
  status: EstimateStatus
  tenantId: string
  estimateId: string
  operationId: string
  name: string
  evidence: string
  onPublished: () => void
}) {
  if (input.status === 'draft') {
    await publishEstimate(input.tenantId, input.estimateId)
    input.onPublished()
  }
  await acceptEstimateManually(
    input.tenantId,
    input.estimateId,
    input.operationId,
    input.name,
    input.evidence,
  )
}
