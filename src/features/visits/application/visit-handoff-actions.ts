import { queryOptions } from '@tanstack/react-query'

import { listVisitHandoffs } from '../infrastructure/visit-handoff-repository'

export {
  addVisitHandoff,
  resolveVisitHandoff,
  type VisitHandoff,
} from '../infrastructure/visit-handoff-repository'

export const visitHandoffsKey = (tenantId: string) => ['visit-handoffs', tenantId] as const

export function visitHandoffsQuery(
  tenantId: string,
  visitId: string,
  userId: string,
  revision: string,
) {
  return queryOptions({
    queryKey: [...visitHandoffsKey(tenantId), userId, visitId, revision],
    queryFn: ({ signal }) => listVisitHandoffs(tenantId, visitId, signal),
    refetchOnMount: 'always',
    // Planning and source-visit completion can change the next target even if
    // this visit itself was not edited. Only the open report polls.
    refetchInterval: 30_000,
    // The worker may lose this assignment while the report is closed.
    gcTime: 0,
  })
}
