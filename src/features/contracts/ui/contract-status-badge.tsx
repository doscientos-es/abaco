import { Badge } from '@doscientos/ui'

import { contractStatusLabels, type ContractStatus } from '../domain/contract-status'

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return (
    <Badge variant={status === 'active' ? 'success' : 'neutral'}>
      {contractStatusLabels[status]}
    </Badge>
  )
}
