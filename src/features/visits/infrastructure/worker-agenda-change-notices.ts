import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type WorkerAgendaChangeNotice = {
  id: string
  visit_id: string
  visit_title: string
  change_kind: 'assigned' | 'rescheduled' | 'skipped' | 'canceled'
  changed_at: string
  seen_at: string | null
  before_start_at: string | null
  before_end_at: string | null
  before_timezone: string | null
  after_start_at: string | null
  after_end_at: string | null
  after_timezone: string | null
}

export async function listWorkerAgendaChangeNotices(
  tenantId: string,
): Promise<WorkerAgendaChangeNotice[]> {
  const result = await createBrowserSupabaseClient().rpc('list_my_visit_agenda_change_notices', {
    p_tenant_id: tenantId,
  })
  if (result.error) throw new Error('No se pudieron consultar los cambios de agenda.')
  return (result.data ?? []) as WorkerAgendaChangeNotice[]
}

export async function markWorkerAgendaChangeSeen(tenantId: string, id: string): Promise<string> {
  const result = await createBrowserSupabaseClient().rpc('mark_my_visit_agenda_change_seen', {
    p_tenant_id: tenantId,
    p_change_id: id,
  })
  if (result.error) throw new Error('No se pudo marcar el cambio como visto. Reinténtalo.')
  if (typeof result.data !== 'string') {
    throw new Error('Este cambio ya no está disponible para tu asignación.')
  }
  return result.data
}
