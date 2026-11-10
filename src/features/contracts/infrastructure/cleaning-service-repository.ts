import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import type { ContractJobDraft } from '../domain/contract-job'

export type CleaningService = ContractJobDraft & {
  id: string
  configured: boolean
  source_line_id: string | null
  time_known: boolean
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

export type ContractJobListItem = Pick<CleaningService, 'id' | 'title' | 'configured' | 'frequency' | 'modality'> & {
  contract: { id: string; title: string; client_id: string; status: string }
  location: { name: string } | null
}

export async function listContractJobs(tenantId: string, page: number) {
  const pageSize = 20
  const { data, error, count } = await createBrowserSupabaseClient()
    .from('service_contract_visit_rules')
    .select('id,title,configured,frequency,modality,contract:service_contracts(id,title,client_id,status),location:service_locations(name)', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw new Error(error.message)
  return {
    items: (data ?? []).map((row) => ({ ...row,
      contract: Array.isArray(row.contract) ? row.contract[0] : row.contract,
      location: Array.isArray(row.location) ? (row.location[0] ?? null) : row.location,
    })) as ContractJobListItem[], count: count ?? 0, pageSize,
  }
}

export async function addCleaningService(
  tenantId: string,
  contractId: string,
  service: ContractJobDraft,
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
