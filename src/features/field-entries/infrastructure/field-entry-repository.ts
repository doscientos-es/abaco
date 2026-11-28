import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type FieldEntryKind =
  | 'labor'
  | 'travel'
  | 'material'
  | 'spare'
  | 'product'
  | 'corrective_action'

export type FieldEntry = {
  id: string
  visit_id: string
  work_order_id: string | null
  contract_id: string | null
  kind: FieldEntryKind
  description: string
  quantity: number
  unit: string
  occurred_at: string
  recorded_at: string
  supersedes_id: string | null
  office_review_requested: boolean
}

export async function listVisitFieldEntries(tenantId: string, visitId: string, page: number) {
  const pageSize = 25
  const db = createBrowserSupabaseClient()
  const { data, count, error } = await db
    .from('service_visit_field_entries')
    .select(
      'id,visit_id,work_order_id,contract_id,kind,description,quantity,unit,occurred_at,recorded_at,supersedes_id,office_review_requested',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .eq('visit_id', visitId)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw new Error(error.message)
  const entries = (data ?? []) as FieldEntry[]
  const originalIds = entries.map((entry) => entry.id)
  let supersededIds: string[] = []
  if (originalIds.length) {
    const result = await db
      .from('service_visit_field_entries')
      .select('supersedes_id')
      .eq('tenant_id', tenantId)
      .eq('visit_id', visitId)
      .in('supersedes_id', originalIds)
    if (result.error) throw new Error(result.error.message)
    supersededIds = (result.data ?? []).flatMap((row) =>
      typeof row.supersedes_id === 'string' ? [row.supersedes_id] : [],
    )
  }
  return { entries, count: count ?? 0, pageSize, supersededIds }
}

export async function recordVisitFieldEntry(input: {
  tenantId: string
  visitId: string
  kind: FieldEntryKind
  description: string
  quantity: number
  unit: string
  occurredAt: string
  supersedesId: string | null
  operationId: string
  expectedActor: string
  officeReviewRequested?: boolean
}) {
  const db = createBrowserSupabaseClient()
  const session = await db.auth.getSession()
  if (session.error || session.data.session?.user.id !== input.expectedActor)
    throw new Error('La sesión ha cambiado. Abre de nuevo la visita antes de enviar.')
  const { data, error } = await db.rpc(
    input.officeReviewRequested === undefined
      ? 'record_service_visit_field_entry'
      : 'record_service_visit_material',
    {
      p_tenant_id: input.tenantId,
      p_visit_id: input.visitId,
      p_kind: input.kind,
      p_description: input.description,
      p_quantity: input.quantity,
      p_unit: input.unit,
      p_occurred_at: input.occurredAt,
      p_supersedes_id: input.supersedesId,
      p_operation_id: input.operationId,
      ...(input.officeReviewRequested === undefined
        ? {}
        : { p_office_review_requested: input.officeReviewRequested }),
    },
  )
  if (error) throw new Error(error.message)
  return data as string
}

export type VisitMaterialChoice = { id: string; name: string; unit: string }

export async function listVisitMaterialChoices(tenantId: string, visitId: string, search: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'list_service_visit_material_choices',
    { p_tenant_id: tenantId, p_visit_id: visitId, p_search: search },
  )
  if (error) throw new Error(error.message)
  return (data ?? []) as VisitMaterialChoice[]
}

export type VisitMaterialForReview = {
  id: string
  description: string
  quantity: number
  unit: string
  occurred_at: string
}

export async function listVisitMaterialsForReview(tenantId: string, visitId: string, page: number) {
  const pageSize = 20
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'list_service_visit_materials_for_review',
    { p_tenant_id: tenantId, p_visit_id: visitId, p_offset: page * pageSize },
  )
  if (error) throw new Error(error.message)
  const entries = (data ?? []) as VisitMaterialForReview[]
  return { entries: entries.slice(0, pageSize), hasMore: entries.length > pageSize }
}
