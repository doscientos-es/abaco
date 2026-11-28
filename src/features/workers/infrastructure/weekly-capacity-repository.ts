import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { fetchAllPages } from '@/shared/lib/supabase/fetch-all-pages'

import { loadStatuses, type WeeklyCapacityVisit } from '../domain/weekly-capacity'

export const weeklyCapacityVisitsQuery = (
  tenantId: string,
  userId: string,
  bounds: { start: number; end: number },
) =>
  queryOptions({
    // Office replans invalidate this prefix. Keep viewer and bounds in the key.
    queryKey: ['office-visits', tenantId, 'weekly-capacity', userId, bounds.start, bounds.end],
    queryFn: () =>
      fetchAllPages<WeeklyCapacityVisit>(
        (from, to) =>
          createBrowserSupabaseClient()
            .from('service_visits')
            .select('id,scheduled_start_at,scheduled_end_at,status,assigned_user_id,work_team_id')
            .eq('tenant_id', tenantId)
            .in('status', [...loadStatuses])
            .lt('scheduled_start_at', new Date(bounds.end).toISOString())
            .gte('scheduled_start_at', new Date(bounds.start - 12 * 3_600_000).toISOString())
            .gt('scheduled_end_at', new Date(bounds.start).toISOString())
            .order('id')
            .range(from, to),
        'No se pudo cargar la carga de trabajo de la semana.',
      ),
  })
