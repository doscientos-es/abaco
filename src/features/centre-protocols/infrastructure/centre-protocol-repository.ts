import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { AssignedCentreProtocol, OfficeCentreProtocol } from '../domain/centre-protocol'

export async function loadCentreProtocol(tenantId: string, locationId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_location_protocol_versions')
    .select('revision,items,shared')
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .order('revision', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('load_failed')
  return (data ?? null) as OfficeCentreProtocol | null
}

export async function saveCentreProtocol(input: {
  tenantId: string
  locationId: string
  expected: number
  items: string[]
  shared: boolean
  reviewed: boolean
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'save_service_location_protocol',
    {
      p_tenant: input.tenantId,
      p_location: input.locationId,
      p_expected: input.expected,
      p_items: input.items,
      p_shared: input.shared,
      p_reviewed: input.reviewed,
      p_operation: input.operationId,
    },
  )
  if (error || typeof data !== 'number')
    throw new Error(error?.code === 'P0409' ? 'conflict' : 'save_failed')
  return data
}

export async function listAssignedCentreProtocols(tenantId: string, ids: readonly string[]) {
  const protocols: AssignedCentreProtocol[] = []
  const unique = [...new Set(ids)]
  for (let index = 0; index < unique.length; index += 50) {
    const { data, error } = await createBrowserSupabaseClient().rpc(
      'list_assigned_visit_protocols',
      {
        p_tenant: tenantId,
        p_visit_ids: unique.slice(index, index + 50),
      },
    )
    if (error) throw new Error('load_failed')
    protocols.push(...((data ?? []) as AssignedCentreProtocol[]))
  }
  return protocols
}
