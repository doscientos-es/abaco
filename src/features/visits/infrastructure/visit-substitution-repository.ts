import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { fetchAllPages } from '@/shared/lib/supabase/fetch-all-pages'

import type { SubstitutionSlot } from '../domain/visit-substitution'

/** Only the assignments occupying the current slot, not clients or absence details. */
export function listSubstitutionSlots(tenantId: string, startAt: string, endAt: string) {
  // Visits cannot exceed 12 hours; bind both sides of the indexed start range.
  const firstPossibleStart = new Date(Date.parse(startAt) - 12 * 60 * 60_000).toISOString()
  return fetchAllPages<SubstitutionSlot>(
    (from, to) =>
      createBrowserSupabaseClient()
        .from('service_visits')
        .select(
          'id,assigned_user_id,work_team_id,updated_at,work_order_id,work_orders(work_team_id)',
        )
        .eq('tenant_id', tenantId)
        .in('status', ['scheduled', 'in_progress'])
        .lt('scheduled_start_at', endAt)
        .gte('scheduled_start_at', firstPossibleStart)
        .gt('scheduled_end_at', startAt)
        .order('id')
        .range(from, to),
    'No se pudieron comprobar los solapes de las visitas.',
  )
}
