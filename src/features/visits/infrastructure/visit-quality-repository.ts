import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { fetchAllPages } from '@/shared/lib/supabase/fetch-all-pages'

import type {
  QualityCategory,
  QualityMode,
  QualityState,
  QualityStatus,
} from '../domain/visit-quality'

export type QualityRecord = QualityState & {
  report_version_id: string
  visit_id: string
  version: number
  closed_at: string
  visit_title: string | null
  client_name: string | null
}
export type QualityEvent = QualityState & { actor_id: string; recorded_at: string }
type MemberRow = { user_id: string; profiles: { full_name: string | null } | null }
const pageSize = 20

export async function listQualityReview(
  tenantId: string,
  week: string,
  mode: QualityMode,
  page: number,
) {
  const { data, error } = await createBrowserSupabaseClient().rpc('list_visit_quality_reviews', {
    p_tenant: tenantId,
    p_week: week,
    p_mode: mode,
    p_offset: page * pageSize,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as QualityRecord[]
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize }
}

export async function listQualityOwners(tenantId: string) {
  const rows = await fetchAllPages<MemberRow>(
    (from, to) =>
      createBrowserSupabaseClient()
        .from('memberships')
        .select('user_id,profiles(full_name)')
        .eq('tenant_id', tenantId)
        .in('role', ['owner', 'admin'])
        .order('user_id')
        .range(from, to),
    'No se pudieron comprobar los responsables.',
  )
  return rows
    .map((row) => ({ id: row.user_id, label: row.profiles?.full_name || 'Administración' }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es') || a.id.localeCompare(b.id))
}

export async function listQualityEvents(tenantId: string, reportId: string) {
  return fetchAllPages<QualityEvent>(
    (from, to) =>
      createBrowserSupabaseClient()
        .from('service_visit_quality_events')
        .select('revision,status,category,owner_id,actor_id,recorded_at')
        .eq('tenant_id', tenantId)
        .eq('report_version_id', reportId)
        .order('revision', { ascending: false })
        .range(from, to),
    'No se pudo cargar el historial.',
  )
}

export async function recordQualityReview(input: {
  tenantId: string
  reportId: string
  expectedRevision: number
  status: QualityStatus
  category: QualityCategory | null
  ownerId: string | null
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('record_visit_quality_review', {
    p_tenant: input.tenantId,
    p_report: input.reportId,
    p_expected_revision: input.expectedRevision,
    p_status: input.status,
    p_category: input.category,
    p_owner: input.ownerId,
    p_operation: input.operationId,
  })
  if (error) throw new Error(error.code === 'P0409' ? 'conflict' : 'save_failed')
  if (typeof data !== 'number') throw new Error('save_failed')
  return data
}
