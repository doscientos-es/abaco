import { queryOptions } from '@tanstack/react-query'

import { staffAbsencesQuery } from '@/features/staff-schedules/application/staff-schedule-actions'
import { moveDays } from '@/shared/lib/date-range'

import { listPlanningVisits } from './visit-actions'

export const agendaResolutionVisitsQuery = (tenantId: string, today: string) =>
  queryOptions({
    queryKey: ['office-visits', tenantId, 'resolution', today],
    queryFn: () => listPlanningVisits(tenantId, today, moveDays(today, 1), null),
  })

// A visit starting tomorrow can end the day after; reuse the approved-absence cache and invalidation.
export const agendaResolutionAbsencesQuery = (tenantId: string, today: string) =>
  staffAbsencesQuery(tenantId, today, moveDays(today, 2))
