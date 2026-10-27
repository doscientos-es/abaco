import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type ContractStatus = 'draft' | 'active' | 'paused' | 'expired' | 'canceled'
export type BillingFrequency = 'monthly' | 'quarterly' | 'yearly'

export type ServiceContract = {
  id: string
  tenant_id: string
  client_id: string
  origin_estimate_id: string | null
  location_id: string
  asset_id: string | null
  title: string
  status: ContractStatus
  starts_on: string
  ends_on: string | null
  timezone: string
  price_cents: number
  billing_frequency: BillingFrequency
  default_assigned_user_id: string | null
  included_scope: Array<{ description: string }>
  schedule_version: number
  updated_at: string
  created_at: string
}

export type ContractVisitRule = {
  id: string
  season: 'high' | 'low'
  months: number[]
  weekday: number
  every_n_weeks: number
  local_start: string
  duration_minutes: number
  title: string
}

export type ContractEvent = {
  id: string
  kind: 'created' | 'rule_added' | 'status_changed'
  payload: Record<string, unknown>
  occurred_at: string
}

export type ContractVisit = {
  id: string
  title: string
  contract_occurrence_on: string
  contract_schedule_version: number
  scheduled_start_at: string
  status: string
  assigned_user_id: string | null
}

export type GenerationIssue = {
  id: string
  occurrence_on: string
  kind: 'invalid_local_time' | 'assignment_conflict'
  detail: string
  created_at: string
}

const columns =
  'id,tenant_id,client_id,origin_estimate_id,location_id,asset_id,title,status,starts_on,ends_on,timezone,price_cents,billing_frequency,default_assigned_user_id,included_scope,schedule_version,updated_at,created_at'

export async function findContractForEstimate(tenantId: string, estimateId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_contracts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('origin_estimate_id', estimateId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.id as string | undefined) ?? null
}

export async function convertAcceptedEstimateToContract(input: {
  tenantId: string
  estimateId: string
  locationId: string
  assetId: string | null
  startsOn: string
  endsOn: string | null
  defaultAssignedUserId: string | null
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'convert_accepted_estimate_to_contract',
    {
      p_tenant_id: input.tenantId,
      p_estimate_id: input.estimateId,
      p_location_id: input.locationId,
      p_asset_id: input.assetId,
      p_starts_on: input.startsOn,
      p_ends_on: input.endsOn,
      p_default_assigned_user_id: input.defaultAssignedUserId,
      p_operation_id: input.operationId,
    },
  )
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo crear el contrato.')
  return data
}

export async function listServiceContracts(tenantId: string, page: number) {
  const pageSize = 20
  const { data, count, error } = await createBrowserSupabaseClient()
    .from('service_contracts')
    .select(columns, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw new Error(error.message)
  return { items: (data ?? []) as ServiceContract[], count: count ?? 0, pageSize }
}

export async function loadServiceContract(tenantId: string, contractId: string) {
  const db = createBrowserSupabaseClient()
  const [contractResult, rulesResult, eventsResult, visitsResult, issuesResult] = await Promise.all(
    [
      db
        .from('service_contracts')
        .select(columns)
        .eq('tenant_id', tenantId)
        .eq('id', contractId)
        .maybeSingle(),
      db
        .from('service_contract_visit_rules')
        .select('id,season,months,weekday,every_n_weeks,local_start,duration_minutes,title')
        .eq('tenant_id', tenantId)
        .eq('contract_id', contractId)
        .order('season'),
      db
        .from('service_contract_events')
        .select('id,kind,payload,occurred_at')
        .eq('tenant_id', tenantId)
        .eq('contract_id', contractId)
        .order('occurred_at', { ascending: false })
        .limit(30),
      db
        .from('service_visits')
        .select(
          'id,title,contract_occurrence_on,contract_schedule_version,scheduled_start_at,status,assigned_user_id',
        )
        .eq('tenant_id', tenantId)
        .eq('contract_id', contractId)
        .order('scheduled_start_at', { ascending: false })
        .limit(50),
      db
        .from('service_contract_generation_issues')
        .select('id,occurrence_on,kind,detail,created_at')
        .eq('tenant_id', tenantId)
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false })
        .limit(30),
    ],
  )
  if (contractResult.error || !contractResult.data)
    throw new Error(contractResult.error?.message ?? 'Contrato no encontrado.')
  for (const result of [rulesResult, eventsResult, visitsResult, issuesResult]) {
    if (result.error) throw new Error(result.error.message)
  }
  return {
    contract: contractResult.data as ServiceContract,
    rules: (rulesResult.data ?? []) as ContractVisitRule[],
    events: (eventsResult.data ?? []) as ContractEvent[],
    visits: (visitsResult.data ?? []) as ContractVisit[],
    issues: (issuesResult.data ?? []) as GenerationIssue[],
  }
}

export async function createManualServiceContract(input: {
  tenantId: string
  clientId: string
  locationId: string
  assetId: string | null
  title: string
  startsOn: string
  endsOn: string | null
  priceCents: number
  billingFrequency: BillingFrequency
  defaultAssignedUserId: string | null
  includedScope: Array<{ description: string }>
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'create_manual_service_contract',
    {
      p_tenant_id: input.tenantId,
      p_client_id: input.clientId,
      p_location_id: input.locationId,
      p_asset_id: input.assetId,
      p_title: input.title.trim(),
      p_starts_on: input.startsOn,
      p_ends_on: input.endsOn,
      p_price_cents: input.priceCents,
      p_billing_frequency: input.billingFrequency,
      p_default_assigned_user_id: input.defaultAssignedUserId,
      p_included_scope: input.includedScope,
      p_extras_policy: {},
      p_operation_id: input.operationId,
    },
  )
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo crear el contrato.')
  return data
}

export async function addContractVisitRule(input: {
  tenantId: string
  contractId: string
  expectedUpdatedAt: string
  season: ContractVisitRule['season']
  months: number[]
  weekday: number
  everyNWeeks: number
  localStart: string
  durationMinutes: number
  title: string
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('add_contract_visit_rule', {
    p_tenant_id: input.tenantId,
    p_contract_id: input.contractId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_season: input.season,
    p_months: input.months,
    p_weekday: input.weekday,
    p_every_n_weeks: input.everyNWeeks,
    p_local_start: input.localStart,
    p_duration_minutes: input.durationMinutes,
    p_title: input.title.trim(),
    p_operation_id: input.operationId,
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo guardar la frecuencia.')
  return data
}

export async function transitionServiceContract(input: {
  tenantId: string
  contractId: string
  expectedUpdatedAt: string
  nextStatus: Exclude<ContractStatus, 'draft'>
  reason: string
  operationId: string
}) {
  const { error } = await createBrowserSupabaseClient().rpc('transition_service_contract', {
    p_tenant_id: input.tenantId,
    p_contract_id: input.contractId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_next_status: input.nextStatus,
    p_reason: input.reason.trim(),
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
}

export async function generateContractVisits(tenantId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('generate_contract_visits', {
    p_tenant_id: tenantId,
    p_from: null,
    p_through: null,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
