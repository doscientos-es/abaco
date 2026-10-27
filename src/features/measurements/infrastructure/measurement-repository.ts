import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type MeasurementParameter = {
  id: string
  asset_id: string
  code: string
  label: string
  unit: string
  min_value: number | null
  max_value: number | null
  active: boolean
  is_core: boolean
  updated_at: string
}

export type VisitMeasurementParameter = Omit<
  MeasurementParameter,
  'id' | 'active' | 'is_core' | 'updated_at'
> & {
  asset_name: string
  parameter_id: string
  parameter_updated_at: string
}

export type Measurement = {
  id: string
  visit_id: string
  asset_id: string
  parameter_id: string
  value: number
  label_snapshot: string
  unit_snapshot: string
  min_snapshot: number | null
  max_snapshot: number | null
  assessment: 'below' | 'within' | 'above' | 'unconfigured'
  method: string
  device: string
  measured_at: string
  recorded_at: string
  supersedes_id: string | null
}

export type ParameterEvent = {
  operation_id: string
  parameter_id: string
  before_state: {
    label?: string
    unit?: string
    min_value?: number | null
    max_value?: number | null
  } | null
  after_state: {
    label?: string
    unit?: string
    min_value?: number | null
    max_value?: number | null
  }
  occurred_at: string
}

export async function listVisitParameters(tenantId: string, visitId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('visit_measurement_parameters', {
    p_tenant_id: tenantId,
    p_visit_id: visitId,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as VisitMeasurementParameter[]
}

export async function listMeasurements(
  tenantId: string,
  filter: { visitId?: string; assetId?: string },
  page: number,
) {
  const pageSize = 25
  const db = createBrowserSupabaseClient()
  let query = db
    .from('service_visit_measurements')
    .select(
      'id,visit_id,asset_id,parameter_id,value,label_snapshot,unit_snapshot,min_snapshot,max_snapshot,assessment,method,device,measured_at,recorded_at,supersedes_id',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .order('measured_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (filter.visitId) query = query.eq('visit_id', filter.visitId)
  if (filter.assetId) query = query.eq('asset_id', filter.assetId)
  const { data, count, error } = await query
  if (error) throw new Error(error.message)
  const entries = (data ?? []) as Measurement[]
  const originalIds = entries.filter((entry) => !entry.supersedes_id).map((entry) => entry.id)
  let supersededIds: string[] = []
  if (originalIds.length) {
    let successors = db
      .from('service_visit_measurements')
      .select('supersedes_id')
      .eq('tenant_id', tenantId)
      .in('supersedes_id', originalIds)
    if (filter.visitId) successors = successors.eq('visit_id', filter.visitId)
    if (filter.assetId) successors = successors.eq('asset_id', filter.assetId)
    const result = await successors
    if (result.error) throw new Error(result.error.message)
    supersededIds = (result.data ?? []).flatMap((row) =>
      typeof row.supersedes_id === 'string' ? [row.supersedes_id] : [],
    )
  }
  return { entries, count: count ?? 0, pageSize, supersededIds }
}

export async function listPoolParameters(tenantId: string, assetId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('pool_measurement_parameters')
    .select('id,asset_id,code,label,unit,min_value,max_value,active,is_core,updated_at')
    .eq('tenant_id', tenantId)
    .eq('asset_id', assetId)
    .order('is_core', { ascending: false })
    .order('code')
  if (error) throw new Error(error.message)
  return (data ?? []) as MeasurementParameter[]
}

export async function listParameterEvents(tenantId: string, assetId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('pool_measurement_parameter_events')
    .select('operation_id,parameter_id,before_state,after_state,occurred_at')
    .eq('tenant_id', tenantId)
    .eq('asset_id', assetId)
    .order('occurred_at', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  return (data ?? []) as ParameterEvent[]
}

export async function recordMeasurement(input: {
  tenantId: string
  visitId: string
  parameterId: string
  value: number
  method: string
  device: string
  measuredAt: string
  supersedesId: string | null
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'record_service_visit_measurement',
    {
      p_tenant_id: input.tenantId,
      p_visit_id: input.visitId,
      p_parameter_id: input.parameterId,
      p_value: input.value,
      p_method: input.method,
      p_device: input.device,
      p_measured_at: input.measuredAt,
      p_supersedes_id: input.supersedesId,
      p_operation_id: input.operationId,
    },
  )
  if (error) throw new Error(error.message)
  return data as string
}

export async function configureParameter(input: {
  tenantId: string
  assetId: string
  code: string
  label: string
  unit: string
  minValue: number | null
  maxValue: number | null
  active: boolean
  expectedUpdatedAt: string | null
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'configure_pool_measurement_parameter',
    {
      p_tenant_id: input.tenantId,
      p_asset_id: input.assetId,
      p_code: input.code,
      p_label: input.label,
      p_unit: input.unit,
      p_min_value: input.minValue,
      p_max_value: input.maxValue,
      p_active: input.active,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_operation_id: input.operationId,
    },
  )
  if (error) throw new Error(error.message)
  return data as string
}
