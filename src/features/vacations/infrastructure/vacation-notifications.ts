import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type VacationDecisionNotification = {
  id: string
  requestId: string
  decision: 'approved' | 'rejected'
  createdAt: string
  readAt: string | null
}

export async function listVacationDecisionNotifications(
  tenantId: string,
): Promise<VacationDecisionNotification[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('vacation_decision_notifications')
    .select('id, request_id, decision, created_at, read_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw new Error('No se pudieron cargar los avisos de vacaciones.')
  return (data ?? []).map((row) => ({
    id: row.id,
    requestId: row.request_id,
    decision: row.decision,
    createdAt: row.created_at,
    readAt: row.read_at,
  }))
}

export async function readVacationDecisionNotification(id: string): Promise<void> {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'read_vacation_decision_notification',
    {
      p_notification_id: id,
    },
  )
  if (error || data !== true) throw new Error('No se pudo marcar el aviso como leído.')
}
