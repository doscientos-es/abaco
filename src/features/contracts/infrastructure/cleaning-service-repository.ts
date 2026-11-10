import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import type { ContractJobDraft } from '../domain/contract-job'

export type CleaningService = ContractJobDraft & {
  id: string
  title: string
  location_id: string | null
  modality: 'fixed' | 'mobile'
  service_type: 'ordinary' | 'windows' | 'garage' | 'other'
  frequency: ContractJobDraft['frequency']
  configured: boolean
  source_line_id: string | null
  anchor_on: string | null
  ends_on: string | null
  weekdays: number[]
  tasks: string
  weekly_tasks: Record<string, string>
  instructions: string
  requires_acceptance: boolean
  duration_minutes: number
  local_start: string
  time_known: boolean
  assigned_user_id: string | null
  work_team_id: string | null
  location?: {
    name: string
    address: string
    operational_contact: string
    access_notes: string
    notes: string
  } | null
}

export async function listCleaningServices(tenantId: string, contractId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_contract_visit_rules')
    .select(
      'id,title,location_id,modality,service_type,frequency,anchor_on,ends_on,weekdays,tasks,weekly_tasks,instructions,requires_acceptance,duration_minutes,local_start,time_known,assigned_user_id,work_team_id,materials,configured,source_line_id,location:service_locations(name,address,operational_contact,access_notes,notes)',
    )
    .eq('tenant_id', tenantId)
    .eq('contract_id', contractId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    ...row,
    location: Array.isArray(row.location) ? (row.location[0] ?? null) : row.location,
  })) as CleaningService[]
}

export async function addCleaningService(
  tenantId: string,
  contractId: string,
  service: Omit<CleaningService, 'id' | 'time_known'>,
  operationId: string,
) {
  const { error } = await createBrowserSupabaseClient().rpc('add_cleaning_service', {
    p_tenant_id: tenantId,
    p_contract_id: contractId,
    p_service: service,
    p_operation_id: operationId,
  })
  if (error) throw new Error(error.message)
}

export async function saveContractJob(input: {
  tenantId: string; contractId: string; jobId: string | null; expectedUpdatedAt: string
  service: ContractJobDraft; operationId: string
}) {
  const { error } = await createBrowserSupabaseClient().rpc('save_contract_job', {
    p_tenant_id: input.tenantId, p_contract_id: input.contractId, p_job_id: input.jobId,
    p_expected_updated_at: input.expectedUpdatedAt, p_service: input.service,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
}
