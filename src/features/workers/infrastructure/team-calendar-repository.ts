import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { fetchAllPages } from '@/shared/lib/supabase/fetch-all-pages'

import type { TeamCalendarAbsence } from '../domain/team-calendar'

type AbsenceRow = {
  requester_id: string
  start_date: string
  end_date: string | null
  status: TeamCalendarAbsence['status']
}

export const teamCalendarAbsencesQuery = (
  tenantId: string,
  userId: string,
  from: string,
  to: string,
) =>
  queryOptions({
    // Share the existing absence invalidation prefix, but never cache these rows across viewers.
    queryKey: ['vacation-requests', tenantId, 'team-calendar', userId, from, to],
    queryFn: async (): Promise<TeamCalendarAbsence[]> => {
      const rows = await fetchAllPages<AbsenceRow>(
        (first, last) =>
          createBrowserSupabaseClient()
            .from('absence_requests')
            .select('requester_id,start_date,end_date,status')
            .eq('tenant_id', tenantId)
            .in('status', ['approved', 'pending', 'needs_info'])
            .lte('start_date', to)
            .or(`end_date.is.null,end_date.gte.${from}`)
            .order('id')
            .range(first, last),
        'No se pudieron cargar las ausencias del calendario.',
      )
      return rows.map((row) => ({
        userId: row.requester_id,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
      }))
    },
  })
