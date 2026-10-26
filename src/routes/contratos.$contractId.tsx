import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { ContractDetailPage } from '@/features/contracts'

export const Route = createFileRoute('/contratos/$contractId')({
  beforeLoad: requirePermission('contracts:read'),
  component: ContractRoute,
})

function ContractRoute() {
  const { contractId } = Route.useParams()
  return <ContractDetailPage contractId={contractId} />
}
