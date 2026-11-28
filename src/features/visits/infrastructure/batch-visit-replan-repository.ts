import type { VacationDateRange } from '@/features/vacations/domain/vacation-conflict'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { fetchAllPages } from '@/shared/lib/supabase/fetch-all-pages'

/** Matches the visit assignment guard; no reason or absence type is returned to the dialog. */
export async function loadBatchBlockingAbsences(tenantId: string, from: string, to: string) {
  const rows = await fetchAllPages<{
    requester_id: string
    start_date: string
    end_date: string | null
  }>(
    (start, end) =>
      createBrowserSupabaseClient()
        .from('absence_requests')
        .select('requester_id,start_date,end_date')
        .eq('tenant_id', tenantId)
        .eq('status', 'approved')
        .in('absence_type', ['vacation', 'sick_leave'])
        .lte('start_date', to)
        .or(`end_date.is.null,end_date.gte.${from}`)
        .order('id')
        .range(start, end),
    'No se pudieron comprobar las ausencias para esta propuesta.',
  )
  return rows.map((row): VacationDateRange => ({
    userId: row.requester_id,
    startDate: row.start_date,
    endDate: row.end_date,
  }))
}

/** Commit the exact instants previewed, not a second conversion if a site's timezone has changed. */
export async function writeBatchVisitReplan(input: {
  tenantId: string
  visitId: string
  expectedUpdatedAt: string
  startAt: string
  endAt: string
  assignedUserId: string | null
  operationId: string
}) {
  const { error, data } = await createBrowserSupabaseClient().rpc('replan_service_visit', {
    p_tenant_id: input.tenantId,
    p_visit_id: input.visitId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_scheduled_start_at: input.startAt,
    p_scheduled_end_at: input.endAt,
    p_assigned_user_id: input.assignedUserId,
    p_reason: 'Desplazamiento confirmado desde Reprogramar varias visitas',
    p_operation_id: input.operationId,
  })
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  if (data !== input.visitId) throw new Error('El servidor no confirmó la visita esperada.')
}
