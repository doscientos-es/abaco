import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { SearchItem } from '../domain/search'

/** Bounded server queries; tenant filters and existing RLS remain the authority. */
export async function searchRemoteResources(tenantId: string, query: string, signal: AbortSignal) {
  const db = createBrowserSupabaseClient()
  const pattern = `%${query.trim().replace(/[\\%_]/g, (value) => `\\${value}`)}%`
  const responses = await Promise.allSettled([
    db
      .from('service_contracts')
      .select('id,title')
      .eq('tenant_id', tenantId)
      .ilike('title', pattern)
      .order('title')
      .order('id')
      .limit(6)
      .abortSignal(signal),
    db
      .from('work_orders')
      .select('id,title')
      .eq('tenant_id', tenantId)
      .ilike('title', pattern)
      .order('title')
      .order('id')
      .limit(6)
      .abortSignal(signal),
  ])
  const items: SearchItem[] = []
  let failed = false
  for (const [index, response] of responses.entries()) {
    if (response.status === 'rejected' || response.value.error) {
      failed = true
      continue
    }
    for (const row of response.value.data ?? []) {
      items.push({
        id: `${index === 0 ? 'contract' : 'work'}:${row.id}`,
        title: row.title,
        category: index === 0 ? 'Contratos' : 'Trabajos',
        target:
          index === 0
            ? { to: '/contratos/$contractId', params: { contractId: row.id } }
            : { to: '/trabajos/$workOrderId', params: { workOrderId: row.id } },
      })
    }
  }
  return { items, failed }
}
