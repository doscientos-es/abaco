import type { EstimateStatus } from '@/shared/domain/types'

import { acceptEstimateManually, publishEstimate } from './estimate-publication-actions'

export async function recordManualApproval(input: {
  status: EstimateStatus
  tenantId: string
  estimateId: string
  operationId: string
  onPublished: () => void
}) {
  if (input.status !== 'draft' && input.status !== 'sent') {
    throw new Error('Solo se pueden aprobar presupuestos en borrador o enviados.')
  }
  if (input.status === 'draft') {
    await publishEstimate(input.tenantId, input.estimateId)
    input.onPublished()
  }
  await acceptEstimateManually(
    input.tenantId,
    input.estimateId,
    input.operationId,
    'Oficina',
    'Aprobación directa desde oficina, sin persona ni comprobante aportados.',
  )
}
