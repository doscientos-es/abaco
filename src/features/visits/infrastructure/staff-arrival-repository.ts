import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type AssignedVisitArrival = {
  visit_id: string
  instructions: string | null
  parking: string | null
  contact_label: string | null
  contact_phone: string | null
}

export async function listAssignedVisitArrivals(tenantId: string, ids: readonly string[]) {
  const arrivals: AssignedVisitArrival[] = []
  const unique = [...new Set(ids)]
  for (let index = 0; index < unique.length; index += 50) {
    const { data, error } = await createBrowserSupabaseClient().rpc(
      'list_assigned_visit_arrivals',
      {
        p_tenant_id: tenantId,
        p_visit_ids: unique.slice(index, index + 50),
      },
    )
    if (error) throw new Error('No se pudieron consultar las indicaciones compartidas.')
    arrivals.push(...((data ?? []) as AssignedVisitArrival[]))
  }
  return arrivals
}
