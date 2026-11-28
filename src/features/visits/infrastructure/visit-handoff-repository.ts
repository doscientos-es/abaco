import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type VisitHandoff = {
  id: string
  title: string
  status: 'pending' | 'resolved' | 'not_forwarded'
}

export type VisitHandoffs = {
  can_create: boolean
  can_resolve: boolean
  has_scope: boolean
  incoming: VisitHandoff[]
  incoming_has_more: boolean
  outgoing: VisitHandoff[]
}

export async function listVisitHandoffs(
  tenantId: string,
  visitId: string,
  signal?: AbortSignal,
): Promise<VisitHandoffs> {
  const request = createBrowserSupabaseClient().rpc('list_service_visit_handoffs', {
    p_tenant_id: tenantId,
    p_visit_id: visitId,
  })
  const { data, error } = await (signal ? request.abortSignal(signal) : request)
  if (error) throw new Error(error.message)
  return data as VisitHandoffs
}

export async function addVisitHandoff(
  tenantId: string,
  visitId: string,
  title: string,
  operationId: string,
) {
  const { error } = await createBrowserSupabaseClient().rpc('create_service_visit_handoff', {
    p_tenant_id: tenantId,
    p_source_visit_id: visitId,
    p_title: title,
    p_operation_id: operationId,
  })
  if (error) throw new Error(error.message)
}

export async function resolveVisitHandoff(
  tenantId: string,
  visitId: string,
  handoffId: string,
  operationId: string,
) {
  const { error } = await createBrowserSupabaseClient().rpc('resolve_service_visit_handoff', {
    p_tenant_id: tenantId,
    p_visit_id: visitId,
    p_handoff_id: handoffId,
    p_operation_id: operationId,
  })
  if (error) throw new Error(error.message)
}
