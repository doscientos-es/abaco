import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { fetchAllPages } from '@/shared/lib/supabase/fetch-all-pages'

import type { WorkDayVisit } from '../domain/work-days'

export function listWorkDayVisits(tenantId: string, workOrderId: string) {
  return fetchAllPages<WorkDayVisit>((from, to) =>
    createBrowserSupabaseClient()
      .from('service_visits')
      .select('id,scheduled_start_at,status,updated_at,service_locations(timezone)')
      .eq('tenant_id', tenantId)
      .eq('work_order_id', workOrderId)
      .neq('status', 'canceled')
      .order('scheduled_start_at')
      .order('id')
      .range(from, to),
  )
}
