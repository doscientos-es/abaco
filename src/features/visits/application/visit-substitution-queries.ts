import { queryOptions } from '@tanstack/react-query'

import { listSubstitutionSlots } from '../infrastructure/visit-substitution-repository'
import type { VisitSummary } from './visit-actions'

export const substitutionSlotsQuery = (tenantId: string, visit: VisitSummary) =>
  queryOptions({
    queryKey: [
      'office-visits',
      tenantId,
      'substitution',
      visit.scheduled_start_at,
      visit.scheduled_end_at,
    ],
    queryFn: () =>
      listSubstitutionSlots(tenantId, visit.scheduled_start_at, visit.scheduled_end_at),
  })
