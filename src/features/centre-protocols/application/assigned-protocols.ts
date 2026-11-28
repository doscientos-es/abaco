import { queryOptions } from '@tanstack/react-query'

import { listAssignedCentreProtocols } from '../infrastructure/centre-protocol-repository'

export const assignedCentreProtocolsQuery = (
  tenantId: string | null | undefined,
  userId: string | undefined,
  ids: string[],
) =>
  queryOptions({
    queryKey: ['assigned-centre-protocols', tenantId, userId, ids],
    queryFn: () => (tenantId ? listAssignedCentreProtocols(tenantId, ids) : []),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  })
